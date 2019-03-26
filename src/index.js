import { h, Component } from 'preact';
import delve from 'dlv';
import { join, get, shallowEqual, removeKeyFromObject, noop, assign } from './util'; // eslint-disable-line no-unused-vars

/**	Creates a higher order component (HOC) that resolves (async) values from a model to props.
 *	This allows (but importantly abstracts) context access, and manages re-rendering in response to resolved data.
 *	`wire()` is simply a formalization of what is typically done as side-effects within `componentDidMount()`.
 *
 *	@name wire
 *	@param {String} [contextNamespace]		The context property at which to obtain a model instance. If empty, all of `context` is used.
 *	@param {Object|Function} [mapToProps]	Maps incoming props to model method call descriptors: `['method.name', ...args]`
 *	@param {Function} [mapModelToProps]		Maps model properties/methods to props: `model => ({ prop: model.property })`
 *	@returns {Function} wiring(Child) -> WireDataWrapper<Child>.  The resulting HOC has a method `getWrappedComponent()` that returns the Child that was wrapped
 *
 *	@example
 *	// resolves news.getTopStories(), passing it down as a "stories" prop
 *	let withTopStories = wire('news', {
 *		stories: 'getTopStories'
 *	});
 *	export default withTopStories( props =>
 *		<ul>
 *			{ props.stories.map( item =>
 *				<li>{item.title}</li>
 *			) }
 *		</ul>
 *	);
 *
 *	@example
 *	// resolves a news story by ID and passes it down as a "story" prop
 *	let withStory = wire('news', props => ({
 *		story: ['getStory', props.id]
 *	}));
 *
 *	// Simple "view" functional component to render a story
 *	const StoryView = ({ story }) => (
 *		<div class="story">
 *			<h2>{story ? story.title : '...'}</h2>
 *			<p>{story && story.content}</p>
 *		</div>
 *	);
 *
 *	// Wrap StoryView in the loader component created by wire()
 *	const Story = withStory(StoryView);
 *
 *	//Get access to the wrapped Component
 *	Story.getWrappedComponent() === StoryView; // true
 *
 *	// Provide a news model into context so Story can wire up to it
 *	render(
 *		<Provider news={newsModel({ origin: '//news.api' })}>
 *			<div class="demo">
 *				<h1>News Story #1234:</h1>
 *				<Story id="1234" />
 *			</div>
 *		</Provider>
 *	);
 */
export default function wire(contextNamespace, mapToProps={}, mapModelToProps=noop) {
	const CACHE = {};

	return Child => {
		class WireDataWrapper extends Component {

			invoke(props, keysOnly, refresh) {
				let source = get(this.context, contextNamespace),
					isFunction = typeof mapToProps==='function',
					mapping = isFunction ? mapToProps(props) : mapToProps,
					keys = [];

				for (let prop in mapping) if (mapping.hasOwnProperty(prop)) {
					let path = mapping[prop],
						args = [];
					if (Array.isArray(path)) {
						args = path.slice(1);
						path = path[0];
					}
					if (!isFunction) {
						args = args.map( p => typeof p==='string' && p in props ? props[p] : p );
					}

					let key = JSON.stringify([contextNamespace, path, ...args]);
					keys.push(key);
					if (keysOnly) continue;

					if (!refresh && this.currentKeys[prop]===key) {
						continue;
					}

					this.currentKeys[prop] = key;

					let p;
					if (typeof path==='function') {
						p = path();
					}
					else if (typeof path!=='string') {
						p = path;
					}
					else {
						let fn = delve(source, path);
						if (!fn) throw Error(`${contextNamespace}.${path} not found.`);
						p = fn(...args);
					}

					if (p && p.then!==undefined && p.__wiretieResolved) {
						p = p.__wiretieResolved;
					}

					// magically re-render for async values:
					if (p && p.then!==undefined) {

						let newState = {};
						let { pending, rejected } = this.state;

						// set that this property call is pending if not already set
						if (!pending) {
							newState.pending = { [prop]: true };
						}
						else if (!pending[prop]) {
							newState.pending = { ...pending, [prop]: true };
						}

						// Since we're starting a new call for prop, remove any old rejected status for it if it exists
						if (rejected && rejected[prop]) {
							newState.rejected = removeKeyFromObject(prop, rejected);
						}

						let id = ++this.counter;
						this.tracking[prop] = id;

						// handle the promise results
						p.then( data => {
							p.__wiretieResolved = data;

							// cache the result if the promise resolved successfully
							let newState = {};
							newState[prop] = CACHE[key] = data;
							return newState;
						}).catch( err => {
							if (this.tracking[prop]!==id) return;

							// If there was an error, use the cached value if available and set the rejected property
							let rejected = this.state.rejected && { ...this.state.rejected } || {};
							rejected[prop] = err;
							let newState = { rejected };
							if (CACHE[key]) newState[prop] = CACHE[key];
							return newState;
						}).then( newState => {
							if (this.tracking[prop]!==id) return;
							delete this.tracking[prop];

							// remove the pending key for this prop if necessary
							let pending = this.state.pending;
							if (pending && pending[prop]) newState.pending = removeKeyFromObject(prop, pending);
							this.setState(newState);
						});

						// if we got a Promise but there's a cached value, use that until the new value comes in:
						if (typeof CACHE[key] !== 'undefined') {
							newState[prop] = CACHE[key];
						}
						this.setState(newState);
					}
					else {
						//for non-promises, just set the state with the value
						this.setState({ [prop]: p });
					}
				}

				return this.keys = keys;
			}

			constructor(props, context) {
				super(props, context);

				this.state = {};
				this.currentKeys = {};

				// used for creating unique IDs.
				this.tracking = {};
				this.counter = 0;

				this.mapping = mapModelToProps(get(context, contextNamespace), props);

				/** Props passed to your wrapped component.
				 *	@name props
				 */

				/** If any Promises are pending, the corresponding prop names will be keys in a `props.pending` Object.
	  			 *	If there are no pending promises, `props.pending` is `undefined`.
				 *	@name pending
				 *	@memberof props
				 *	@type {Object<Boolean>|undefined}
				 */

				/** If any Promises have been rejected, their values are available in a `props.rejected` Object.
	 			 *	If there are no rejected promises, `props.rejected` is `undefined`.
	 			 *	@name rejected
				 *	@memberof props
	 			 *	@type {Object<Error>|undefined}
	 			 */

				/** A `refresh()` method is passed down as a prop.
				 *	Invoking this method re-fetches all data props, bypassing the cache.
				 *	@name refresh
				 *	@memberof props
				 *	@function
				 */
				this.refresh = () => {
					this.invoke(this.props, false, true);
				};
			}

			componentWillMount() {
				this.invoke(this.props);
			}

			componentWillReceiveProps(nextProps) {
				if (!shallowEqual(nextProps, this.props) && join(this.keys)!==join(this.invoke(nextProps, true))) {
					this.invoke(nextProps);
				}
			}

			shouldComponentUpdate(props, state) {
				return !shallowEqual(props, this.props) || !shallowEqual(state, this.state);
			}

			render(props, state) {
				return h(Child, { refresh: this.refresh, ...this.mapping, ...props, ...state });
			}
		}
		WireDataWrapper.getWrappedComponent = Child && Child.getWrappedComponent || (() => Child);
		return WireDataWrapper;
	};
}
