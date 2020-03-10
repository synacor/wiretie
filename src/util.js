
/** Joins an array (using newlines) if it exists, otherwise returns an empty string
 *	@private
 */
export function join(arr) {
	return arr ? arr.join('\n') : '';
}

/** Returns an object property if `key` is non-empty, otherwise returns the object itself
 *	@private
 */
export function get(obj, key) {
	return key ? obj[key] : obj;
}

/** Check if two objects have the same keys, and that all values are strictly equal.
 *	@private
 */
export function shallowEqual(a, b) {
	for (let key in a) if (a[key]!==b[key]) return false;
	for (let key in b) if (!(key in a)) return false;
	return true;
}

/** Returns a clone of the given object without a certain key.
 *	Returns undefined if resulting object would be empty.
 *	@private
 */
export function removeKeyFromObject(key, obj) {
	if (Object.prototype.hasOwnProperty.call(obj, key)) {
		obj = { ...obj };
		delete obj[key];
	}
	return Object.keys(obj).length ? obj : undefined;
}

/** An empty function.
 *	@private
 */
export function noop() {}


/** Object.assign ponyfill (note: used by Rollup)
 *	@private
 */
export function assign(obj) {
	for (let i=1; i<arguments.length; i++) {
		// eslint-disable-next-line guard-for-in, prefer-rest-params
		for (let p in arguments[i]) obj[p] = arguments[i][p];
	}
	return obj;
}
