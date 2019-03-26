import { spy, stub, match } from 'sinon';
import chai, { expect } from 'chai';
import sinonChai from 'sinon-chai';
import 'undom/register';
import { h, render } from 'preact';
import Provider from 'preact-context-provider';
import wire from '../src';
chai.use(sinonChai);

/** @jsx h */

/*eslint-env mocha*/

describe('wiretie', () => {
	let scratch = document.createElement('div'),
		mount = jsx => root = render(jsx, scratch, root),
		root;

	beforeEach( () => mount( () => null ) );

	describe('wire()', () => {
		it('should return a function', () => {
			let deco = wire('foo');
			expect(deco).to.be.a('function');
			expect(deco( () => {} )).to.be.a('function');
		});

		describe('getWrappedComponent()', () => {

			it('should be a function', () => {
				expect(wire('foo')(spy()).getWrappedComponent).to.be.a('function');
			});

			it('should return the Child component that it is wrapping', () => {
				let Foo = spy();
				let Wrapped = wire('foo')(Foo);
				expect(Wrapped.getWrappedComponent()).to.equal(Foo);
			});

			it('should recursively call getWrappedComponent() on Child components to return the first non-decorator Child', () => {
				let Foo = spy();
				//Wrap Foo in two layers of configuration to make sure Foo is returned by the top level call to getWrappedComponent
				let Wrapped = wire('foo')(wire('foo')(Foo));
				expect(Wrapped.getWrappedComponent()).to.equal(Foo);
			});

		});

		describe('prop resolution', () => {
			it('should not re-render if nothing required resolution', done => {
				const foo = {};
				const Child = stub().returns(<div />);
				const Connected = wire('foo')(Child);
				mount(<Provider foo={foo}><Connected a="b" /></Provider>);
				expect(Child).to.have.been.calledOnce.and.calledWithMatch({ a: 'b', pending: undefined, rejected: undefined });
				setTimeout( () => {
					expect(Child).to.have.been.calledOnce;
					done();
				});
			});

			it('should re-render when data is resolved', done => {
				const foo = { bar: stub().returns(Promise.resolve('BAR')) };
				const Child = stub().returns(<div />);
				const Connected = wire('foo', {
					bar: 'bar'
				})(Child);
				mount(<Provider foo={foo}><Connected a="b" /></Provider>);
				expect(Child).to.have.been.calledOnce.and.calledWithMatch({ a: 'b', pending: { bar: true }, rejected: undefined });
				expect(foo.bar).to.have.been.calledOnce;
				setTimeout( () => {
					expect(Child).to.have.been.calledTwice;
					expect(Child.secondCall).to.have.been.calledWithMatch({ a: 'b', bar: 'BAR', pending: undefined, rejected: undefined });
					done();
				});
			});

			it('should support deriving mapping from props', done => {
				const foo = { bar: stub().returns(Promise.resolve('BAR')) };
				const Child = stub().returns(<div />);
				const Connected = wire('foo', props => ({
					bar: ['bar', props.a]
				}))(Child);
				mount(<Provider foo={foo}><Connected a="b" /></Provider>);
				expect(Child).to.have.been.calledOnce.and.calledWithMatch({ a: 'b', pending: { bar: true }, rejected: undefined });
				expect(foo.bar).to.have.been.calledOnce.and.calledWith('b');
				setTimeout( () => {
					expect(Child).to.have.been.calledTwice;
					expect(Child.secondCall).to.have.been.calledWithMatch({ a: 'b', bar: 'BAR', pending: undefined, rejected: undefined });
					done();
				});
			});

			it('should catch errors and put them in the rejected prop', done => {
				const foo = { bar: stub().returns(Promise.reject('BAR')) };
				const Child = stub().returns(<div />);
				const Connected = wire('foo', props => ({
					bar: ['bar', props.a]
				}))(Child);
				mount(<Provider foo={foo}><Connected a="b" /></Provider>);
				expect(Child).to.have.been.calledOnce.and.calledWithMatch({ a: 'b', pending: { bar: true }, rejected: undefined });
				expect(foo.bar).to.have.been.calledOnce.and.calledWith('b');
				setTimeout( () => {
					expect(Child).to.have.been.calledTwice;
					expect(Child.secondCall).to.have.been.calledWithMatch({ a: 'b', pending: undefined, rejected: { bar: 'BAR' } });
					done();
				});
			});

			it('should reset errors for subsequent success', done => {
				const foo = { bar: stub().returns(Promise.reject('BAR')) };
				const Child = stub().returns(<div />);
				const Connected = wire('foo', props => ({
					bar: ['bar', props.a]
				}))(Child);
				mount(<Provider foo={foo}><Connected a="b" /></Provider>);
				expect(Child).to.have.been.calledOnce.and.calledWithMatch({ a: 'b', pending: { bar: true }, rejected: undefined });
				expect(foo.bar).to.have.been.calledOnce.and.calledWith('b');
				setTimeout( () => {
					expect(Child).to.have.been.calledTwice;
					expect(Child.secondCall).to.have.been.calledWithMatch({ a: 'b', pending: undefined, rejected: { bar: 'BAR' } });

					Child.reset();
					foo.bar = stub().returns(Promise.resolve('success!'));
					mount(<Provider foo={foo}><Connected a="c" /></Provider>);
					expect(Child).to.have.been.calledOnce.and.calledWithMatch({ a: 'c', pending: { bar: true }, rejected: undefined });
					expect(foo.bar).to.have.been.calledOnce.and.calledWith('c');

					setTimeout( () => {
						expect(Child).to.have.been.calledTwice;
						expect(Child.secondCall, 'second').to.have.been.calledWithMatch({ a: 'c', bar: 'success!', pending: undefined, rejected: undefined });

						done();
					});
				});
			});

			it('should ignore rejection of outdated Promises', done => {

				let callback;
				const foo = { bar: spy( () => new Promise( (resolve, reject) => { callback = reject; }) ) };
				const Child = stub().returns(<div />);
				const Connected = wire('foo', props => ({
					bar: ['bar', props.a]
				}))(Child);
				mount(<Provider foo={foo}><Connected a="a" /></Provider>);
				foo.bar = stub().returns(Promise.reject('seconderror'));
				Child.reset();
				mount(<Provider foo={foo}><Connected a="b" /></Provider>);

				expect(Child).to.have.been.calledOnce.and.calledWithMatch({ a: 'b', pending: { bar: true }, rejected: undefined });
				Child.reset();

				// rejecting the first promise after the second is synchronously resolved at initialization causes them to occur out-of-order.
				// without tracking, this leaves the first Promise's value as what we use for rendering:
				callback('firsterror');

				setTimeout( () => {
					expect(Child).to.have.been.calledOnce.and.calledWithMatch({ a: 'b', pending: undefined, rejected: { bar: 'seconderror' } });

					let callback;
					foo.bar = spy( () => new Promise( (resolve, reject) => { callback = reject; }) );
					Child.reset();
					mount(<Provider foo={foo}><Connected a="c" /></Provider>);
					expect(Child).to.have.been.calledOnce.and.calledWithMatch({ a: 'c', pending: { bar: true }, rejected: undefined });

					Child.reset();
					foo.bar = stub().returns(Promise.resolve('success!'));
					mount(<Provider foo={foo}><Connected a="d" /></Provider>);

					expect(Child).to.have.been.calledOnce.and.calledWithMatch({ a: 'd', pending: { bar: true }, rejected: undefined });

					callback('error!');

					setTimeout( () => {
						expect(Child).to.have.been.calledTwice;
						expect(Child.secondCall).to.have.been.calledWithMatch({ a: 'd', bar: 'success!', pending: undefined, rejected: undefined });

						done();
					});
				});
			});

			it('should ignore resolution of outdated Promises', done => {
				let callback;
				const foo = { bar: spy( () => new Promise( resolve => { callback = resolve; }) ) };
				const Child = stub().returns(<div />);
				const Connected = wire('foo', props => ({
					bar: ['bar', props.a]
				}))(Child);
				mount(<Provider foo={foo}><Connected a="a" /></Provider>);
				expect(Child).to.have.been.calledOnce.and.calledWithMatch({ a: 'a', pending: { bar: true } });
				Child.reset();

				foo.bar = stub().returns(Promise.resolve('two'));
				mount(<Provider foo={foo}><Connected a="b" /></Provider>);
				expect(Child).to.have.been.calledOnce.and.calledWithMatch({ a: 'b', pending: { bar: true } });

				// rejecting the first promise after the second is synchronously resolved at initialization causes them to occur out-of-order.
				// without tracking, this leaves the first Promise's value as what we use for rendering:
				callback('one');

				setTimeout( () => {
					expect(Child).to.have.been.calledTwice;
					expect(Child.secondCall).to.have.been.calledWithMatch({ a: 'b', bar: 'two', pending: undefined });
					Child.reset();

					let callback;
					foo.bar = spy( () => new Promise( resolve => { callback = resolve; }) );

					mount(<Provider foo={foo}><Connected a="c" /></Provider>);
					expect(Child).to.have.been.calledOnce.and.calledWithMatch({ a: 'c', pending: { bar: true }, rejected: undefined });

					Child.reset();
					foo.bar = stub().returns(Promise.reject('error!'));
					mount(<Provider foo={foo}><Connected a="d" /></Provider>);

					expect(Child).to.have.been.calledOnce.and.calledWithMatch({ a: 'd', pending: { bar: true }, rejected: undefined });

					callback('success!');

					setTimeout( () => {
						expect(Child).to.have.been.calledTwice;
						//bar is undefined because we never successfully had a cached value for a="d" before the promise rejection
						expect(Child.secondCall).to.have.been.calledWithMatch({ a: 'd', bar: undefined, pending: undefined, rejected: { bar: 'error!' } });
						done();
					});
				});
			});
		});

		describe('refresh', () => {
			it('should pass a refresh() function prop', () => {
				const Child = stub().returns(<div />);
				const Connected = wire('a')(Child);
				mount(<Connected />);
				expect(Child).to.have.been.calledOnce.and.calledWithMatch({ refresh: match.func });
			});

			it('should re-resolve data when refresh() is called', done => {
				let count = 0;
				const foo = { bar: spy( () => Promise.resolve(++count) ) };
				const Child = stub().returns(<div />);
				const mapToProps = spy( () => ({ bar: 'bar' }) );
				const Connected = wire('foo', mapToProps)(Child);
				mount(<Provider foo={foo}><Connected /></Provider>);

				expect(mapToProps, 'in initial render').to.have.been.calledOnce;

				expect(Child).to.have.been.calledOnce
					.and.calledWithMatch({ pending: { bar: true }, rejected: undefined });

				setTimeout( () => {
					expect(mapToProps, 'in re-render').to.have.been.calledOnce;
					expect(Child).to.have.been.calledTwice
						.and.calledWithMatch({ bar: 1, pending: undefined, rejected: undefined });

					let props = Child.secondCall.args[0];
					expect(props).to.have.property('refresh').that.is.a('function');
					props.refresh();

					expect(mapToProps).to.have.been.calledTwice;
					expect(foo.bar).to.have.been.calledTwice;

					setTimeout( () => {
						expect(Child.callCount).to.equal(4);
						expect(Child).to.have.been.calledWithMatch({ bar: 1, pending: { bar: true }, rejected: undefined });
						expect(Child).to.have.been.calledWithMatch({ bar: 2, pending: undefined, rejected: undefined });
						done();
					});
				});
			});

			it('should use cached value when it exists and we catch an error', done => {
				const foo = { bar: stub().returns(Promise.resolve('BAR')) };
				const Child = stub().returns(<div />);
				const Connected = wire('foo', props => ({
					bar: ['bar', props.a]
				}))(Child);
				mount(<Provider foo={foo}><Connected a="b" /></Provider>);
				expect(Child).to.have.been.calledOnce.and.calledWithMatch({ a: 'b', pending: { bar: true }, rejected: undefined });
				expect(foo.bar).to.have.been.calledOnce.and.calledWith('b');
				setTimeout( () => {
					expect(Child).to.have.been.calledTwice;
					expect(Child.secondCall).to.have.been.calledWithMatch({ a: 'b', bar: 'BAR', pending: undefined, rejected: undefined });

					//this time have foo.bar reject the promise
					foo.bar.returns(Promise.reject('ERR'));
					Child.secondCall.args[0].refresh();

					setTimeout( () => {
						expect(Child.callCount).to.equal(4);
						expect(Child).to.have.been.calledWithMatch({ bar: 'BAR', pending: { bar: true }, rejected: undefined });
						expect(Child).to.have.been.calledWithMatch({ bar: 'BAR', pending: undefined, rejected: { bar: 'ERR' } });
						done();
					});
				});
			});
		});
	});
});
