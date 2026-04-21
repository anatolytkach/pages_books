/*!
 * @overview RSVP - a tiny implementation of Promises/A+.
 * @copyright Copyright (c) 2016 Yehuda Katz, Tom Dale, Stefan Penner and contributors
 * @license   Licensed under MIT license
 *            See https://raw.githubusercontent.com/tildeio/rsvp.js/master/LICENSE
 * @version   3.6.2
 */

(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
	typeof define === 'function' && define.amd ? define(['exports'], factory) :
	(factory((global.RSVP = global.RSVP || {})));
}(this, (function (exports) { 'use strict';

function indexOf(callbacks, callback) {
  for (var i = 0, l = callbacks.length; i < l; i++) {
    if (callbacks[i] === callback) {
      return i;
    }
  }

  return -1;
}

function callbacksFor(object) {
  var callbacks = object._promiseCallbacks;

  if (!callbacks) {
    callbacks = object._promiseCallbacks = {};
  }

  return callbacks;
}

/**
  @class RSVP.EventTarget
*/
var EventTarget = {

  /**
    `RSVP.EventTarget.mixin` extends an object with EventTarget methods. For
    Example:
     ```javascript
    let object = {};
     RSVP.EventTarget.mixin(object);
     object.on('finished', function(event) {
      // handle event
    });
     object.trigger('finished', { detail: value });
    ```
     `EventTarget.mixin` also works with prototypes:
     ```javascript
    let Person = function() {};
    RSVP.EventTarget.mixin(Person.prototype);
     let yehuda = new Person();
    let tom = new Person();
     yehuda.on('poke', function(event) {
      console.log('Yehuda says OW');
    });
     tom.on('poke', function(event) {
      console.log('Tom says OW');
    });
     yehuda.trigger('poke');
    tom.trigger('poke');
    ```
     @method mixin
    @for RSVP.EventTarget
    @private
    @param {Object} object object to extend with EventTarget methods
  */
  mixin: function (object) {
    object['on'] = this['on'];
    object['off'] = this['off'];
    object['trigger'] = this['trigger'];
    object._promiseCallbacks = undefined;
    return object;
  },


  /**
    Registers a callback to be executed when `eventName` is triggered
     ```javascript
    object.on('event', function(eventInfo){
      // handle the event
    });
     object.trigger('event');
    ```
     @method on
    @for RSVP.EventTarget
    @private
    @param {String} eventName name of the event to listen for
    @param {Function} callback function to be called when the event is triggered.
  */
  on: function (eventName, callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function');
    }

    var allCallbacks = callbacksFor(this),
        callbacks = void 0;

    callbacks = allCallbacks[eventName];

    if (!callbacks) {
      callbacks = allCallbacks[eventName] = [];
    }

    if (indexOf(callbacks, callback) === -1) {
      callbacks.push(callback);
    }
  },


  /**
    You can use `off` to stop firing a particular callback for an event:
     ```javascript
    function doStuff() { // do stuff! }
    object.on('stuff', doStuff);
     object.trigger('stuff'); // doStuff will be called
     // Unregister ONLY the doStuff callback
    object.off('stuff', doStuff);
    object.trigger('stuff'); // doStuff will NOT be called
    ```
     If you don't pass a `callback` argument to `off`, ALL callbacks for the
    event will not be executed when the event fires. For example:
     ```javascript
    let callback1 = function(){};
    let callback2 = function(){};
     object.on('stuff', callback1);
    object.on('stuff', callback2);
     object.trigger('stuff'); // callback1 and callback2 will be executed.
     object.off('stuff');
    object.trigger('stuff'); // callback1 and callback2 will not be executed!
    ```
     @method off
    @for RSVP.EventTarget
    @private
    @param {String} eventName event to stop listening to
    @param {Function} callback optional argument. If given, only the function
    given will be removed from the event's callback queue. If no `callback`
    argument is given, all callbacks will be removed from the event's callback
    queue.
  */
  off: function (eventName, callback) {
    var allCallbacks = callbacksFor(this),
        callbacks = void 0,
        index = void 0;

    if (!callback) {
      allCallbacks[eventName] = [];
      return;
    }

    callbacks = allCallbacks[eventName];

    index = indexOf(callbacks, callback);

    if (index !== -1) {
      callbacks.splice(index, 1);
    }
  },


  /**
    Use `trigger` to fire custom events. For example:
     ```javascript
    object.on('foo', function(){
      console.log('foo event happened!');
    });
    object.trigger('foo');
    // 'foo event happened!' logged to the console
    ```
     You can also pass a value as a second argument to `trigger` that will be
    passed as an argument to all event listeners for the event:
     ```javascript
    object.on('foo', function(value){
      console.log(value.name);
    });
     object.trigger('foo', { name: 'bar' });
    // 'bar' logged to the console
    ```
     @method trigger
    @for RSVP.EventTarget
    @private
    @param {String} eventName name of the event to be triggered
    @param {*} options optional value to be passed to any event handlers for
    the given `eventName`
  */
  trigger: function (eventName, options, label) {
    var allCallbacks = callbacksFor(this),
        callbacks = void 0,
        callback = void 0;

    if (callbacks = allCallbacks[eventName]) {
      // Don't cache the callbacks.length since it may grow
      for (var i = 0; i < callbacks.length; i++) {
        callback = callbacks[i];

        callback(options, label);
      }
    }
  }
};

var config = {
  instrument: false
};

EventTarget['mixin'](config);

function configure(name, value) {
  if (arguments.length === 2) {
    config[name] = value;
  } else {
    return config[name];
  }
}

function objectOrFunction(x) {
  var type = typeof x;
  return x !== null && (type === 'object' || type === 'function');
}

function isFunction(x) {
  return typeof x === 'function';
}

function isObject(x) {
  return x !== null && typeof x === 'object';
}

function isMaybeThenable(x) {
  return x !== null && typeof x === 'object';
}

var _isArray = void 0;
if (Array.isArray) {
  _isArray = Array.isArray;
} else {
  _isArray = function (x) {
    return Object.prototype.toString.call(x) === '[object Array]';
  };
}

var isArray = _isArray;

// Date.now is not available in browsers < IE9
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now#Compatibility
var now = Date.now || function () {
  return new Date().getTime();
};

var queue = [];

function scheduleFlush() {
  setTimeout(function () {
    for (var i = 0; i < queue.length; i++) {
      var entry = queue[i];

      var payload = entry.payload;

      payload.guid = payload.key + payload.id;
      payload.childGuid = payload.key + payload.childId;
      if (payload.error) {
        payload.stack = payload.error.stack;
      }

      config['trigger'](entry.name, entry.payload);
    }
    queue.length = 0;
  }, 50);
}

function instrument(eventName, promise, child) {
  if (1 === queue.push({
    name: eventName,
    payload: {
      key: promise._guidKey,
      id: promise._id,
      eventName: eventName,
      detail: promise._result,
      childId: child && child._id,
      label: promise._label,
      timeStamp: now(),
      error: config["instrument-with-stack"] ? new Error(promise._label) : null
    } })) {
    scheduleFlush();
  }
}

/**
  `RSVP.Promise.resolve` returns a promise that will become resolved with the
  passed `value`. It is shorthand for the following:

  ```javascript
  let promise = new RSVP.Promise(function(resolve, reject){
    resolve(1);
  });

  promise.then(function(value){
    // value === 1
  });
  ```

  Instead of writing the above, your code now simply becomes the following:

  ```javascript
  let promise = RSVP.Promise.resolve(1);

  promise.then(function(value){
    // value === 1
  });
  ```

  @method resolve
  @static
  @param {*} object value that the returned promise will be resolved with
  @param {String} label optional string for identifying the returned promise.
  Useful for tooling.
  @return {Promise} a promise that will become fulfilled with the given
  `value`
*/
function resolve$1(object, label) {
  /*jshint validthis:true */
  var Constructor = this;

  if (object && typeof object === 'object' && object.constructor === Constructor) {
    return object;
  }

  var promise = new Constructor(noop, label);
  resolve(promise, object);
  return promise;
}

function withOwnPromise() {
  return new TypeError('A promises callback cannot return that same promise.');
}

function noop() {}

var PENDING = void 0;
var FULFILLED = 1;
var REJECTED = 2;

var GET_THEN_ERROR = new ErrorObject();

function getThen(promise) {
  try {
    return promise.then;
  } catch (error) {
    GET_THEN_ERROR.error = error;
    return GET_THEN_ERROR;
  }
}

function tryThen(then$$1, value, fulfillmentHandler, rejectionHandler) {
  try {
    then$$1.call(value, fulfillmentHandler, rejectionHandler);
  } catch (e) {
    return e;
  }
}

function handleForeignThenable(promise, thenable, then$$1) {
  config.async(function (promise) {
    var sealed = false;
    var error = tryThen(then$$1, thenable, function (value) {
      if (sealed) {
        return;
      }
      sealed = true;
      if (thenable !== value) {
        resolve(promise, value, undefined);
      } else {
        fulfill(promise, value);
      }
    }, function (reason) {
      if (sealed) {
        return;
      }
      sealed = true;

      reject(promise, reason);
    }, 'Settle: ' + (promise._label || ' unknown promise'));

    if (!sealed && error) {
      sealed = true;
      reject(promise, error);
    }
  }, promise);
}

function handleOwnThenable(promise, thenable) {
  if (thenable._state === FULFILLED) {
    fulfill(promise, thenable._result);
  } else if (thenable._state === REJECTED) {
    thenable._onError = null;
    reject(promise, thenable._result);
  } else {
    subscribe(thenable, undefined, function (value) {
      if (thenable !== value) {
        resolve(promise, value, undefined);
      } else {
        fulfill(promise, value);
      }
    }, function (reason) {
      return reject(promise, reason);
    });
  }
}

function handleMaybeThenable(promise, maybeThenable, then$$1) {
  var isOwnThenable = maybeThenable.constructor === promise.constructor && then$$1 === then && promise.constructor.resolve === resolve$1;

  if (isOwnThenable) {
    handleOwnThenable(promise, maybeThenable);
  } else if (then$$1 === GET_THEN_ERROR) {
    reject(promise, GET_THEN_ERROR.error);
    GET_THEN_ERROR.error = null;
  } else if (isFunction(then$$1)) {
    handleForeignThenable(promise, maybeThenable, then$$1);
  } else {
    fulfill(promise, maybeThenable);
  }
}

function resolve(promise, value) {
  if (promise === value) {
    fulfill(promise, value);
  } else if (objectOrFunction(value)) {
    handleMaybeThenable(promise, value, getThen(value));
  } else {
    fulfill(promise, value);
  }
}

function publishRejection(promise) {
  if (promise._onError) {
    promise._onError(promise._result);
  }

  publish(promise);
}

function fulfill(promise, value) {
  if (promise._state !== PENDING) {
    return;
  }

  promise._result = value;
  promise._state = FULFILLED;

  if (promise._subscribers.length === 0) {
    if (config.instrument) {
      instrument('fulfilled', promise);
    }
  } else {
    config.async(publish, promise);
  }
}

function reject(promise, reason) {
  if (promise._state !== PENDING) {
    return;
  }
  promise._state = REJECTED;
  promise._result = reason;
  config.async(publishRejection, promise);
}

function subscribe(parent, child, onFulfillment, onRejection) {
  var subscribers = parent._subscribers;
  var length = subscribers.length;

  parent._onError = null;

  subscribers[length] = child;
  subscribers[length + FULFILLED] = onFulfillment;
  subscribers[length + REJECTED] = onRejection;

  if (length === 0 && parent._state) {
    config.async(publish, parent);
  }
}

function publish(promise) {
  var subscribers = promise._subscribers;
  var settled = promise._state;

  if (config.instrument) {
    instrument(settled === FULFILLED ? 'fulfilled' : 'rejected', promise);
  }

  if (subscribers.length === 0) {
    return;
  }

  var child = void 0,
      callback = void 0,
      result = promise._result;

  for (var i = 0; i < subscribers.length; i += 3) {
    child = subscribers[i];
    callback = subscribers[i + settled];

    if (child) {
      invokeCallback(settled, child, callback, result);
    } else {
      callback(result);
    }
  }

  promise._subscribers.length = 0;
}

function ErrorObject() {
  this.error = null;
}

var TRY_CATCH_ERROR = new ErrorObject();

function tryCatch(callback, result) {
  try {
    return callback(result);
  } catch (e) {
    TRY_CATCH_ERROR.error = e;
    return TRY_CATCH_ERROR;
  }
}

function invokeCallback(state, promise, callback, result) {
  var hasCallback = isFunction(callback);
  var value = void 0,
      error = void 0;

  if (hasCallback) {
    value = tryCatch(callback, result);

    if (value === TRY_CATCH_ERROR) {
      error = value.error;
      value.error = null; // release
    } else if (value === promise) {
      reject(promise, withOwnPromise());
      return;
    }
  } else {
    value = result;
  }

  if (promise._state !== PENDING) {
    // noop
  } else if (hasCallback && error === undefined) {
    resolve(promise, value);
  } else if (error !== undefined) {
    reject(promise, error);
  } else if (state === FULFILLED) {
    fulfill(promise, value);
  } else if (state === REJECTED) {
    reject(promise, value);
  }
}

function initializePromise(promise, resolver) {
  var resolved = false;
  try {
    resolver(function (value) {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve(promise, value);
    }, function (reason) {
      if (resolved) {
        return;
      }
      resolved = true;
      reject(promise, reason);
    });
  } catch (e) {
    reject(promise, e);
  }
}

function then(onFulfillment, onRejection, label) {
  var parent = this;
  var state = parent._state;

  if (state === FULFILLED && !onFulfillment || state === REJECTED && !onRejection) {
    config.instrument && instrument('chained', parent, parent);
    return parent;
  }

  parent._onError = null;

  var child = new parent.constructor(noop, label);
  var result = parent._result;

  config.instrument && instrument('chained', parent, child);

  if (state === PENDING) {
    subscribe(parent, child, onFulfillment, onRejection);
  } else {
    var callback = state === FULFILLED ? onFulfillment : onRejection;
    config.async(function () {
      return invokeCallback(state, child, callback, result);
    });
  }

  return child;
}

var Enumerator = function () {
  function Enumerator(Constructor, input, abortOnReject, label) {
    this._instanceConstructor = Constructor;
    this.promise = new Constructor(noop, label);
    this._abortOnReject = abortOnReject;

    this._init.apply(this, arguments);
  }

  Enumerator.prototype._init = function _init(Constructor, input) {
    var len = input.length || 0;
    this.length = len;
    this._remaining = len;
    this._result = new Array(len);

    this._enumerate(input);
    if (this._remaining === 0) {
      fulfill(this.promise, this._result);
    }
  };

  Enumerator.prototype._enumerate = function _enumerate(input) {
    var length = this.length;
    var promise = this.promise;

    for (var i = 0; promise._state === PENDING && i < length; i++) {
      this._eachEntry(input[i], i);
    }
  };

  Enumerator.prototype._settleMaybeThenable = function _settleMaybeThenable(entry, i) {
    var c = this._instanceConstructor;
    var resolve$$1 = c.resolve;

    if (resolve$$1 === resolve$1) {
      var then$$1 = getThen(entry);

      if (then$$1 === then && entry._state !== PENDING) {
        entry._onError = null;
        this._settledAt(entry._state, i, entry._result);
      } else if (typeof then$$1 !== 'function') {
        this._remaining--;
        this._result[i] = this._makeResult(FULFILLED, i, entry);
      } else if (c === Promise) {
        var promise = new c(noop);
        handleMaybeThenable(promise, entry, then$$1);
        this._willSettleAt(promise, i);
      } else {
        this._willSettleAt(new c(function (resolve$$1) {
          return resolve$$1(entry);
        }), i);
      }
    } else {
      this._willSettleAt(resolve$$1(entry), i);
    }
  };

  Enumerator.prototype._eachEntry = function _eachEntry(entry, i) {
    if (isMaybeThenable(entry)) {
      this._settleMaybeThenable(entry, i);
    } else {
      this._remaining--;
      this._result[i] = this._makeResult(FULFILLED, i, entry);
    }
  };

  Enumerator.prototype._settledAt = function _settledAt(state, i, value) {
    var promise = this.promise;

    if (promise._state === PENDING) {
      if (this._abortOnReject && state === REJECTED) {
        reject(promise, value);
      } else {
        this._remaining--;
        this._result[i] = this._makeResult(state, i, value);
        if (this._remaining === 0) {
          fulfill(promise, this._result);
        }
      }
    }
  };

  Enumerator.prototype._makeResult = function _makeResult(state, i, value) {
    return value;
  };

  Enumerator.prototype._willSettleAt = function _willSettleAt(promise, i) {
    var enumerator = this;

    subscribe(promise, undefined, function (value) {
      return enumerator._settledAt(FULFILLED, i, value);
    }, function (reason) {
      return enumerator._settledAt(REJECTED, i, reason);
    });
  };

  return Enumerator;
}();

function makeSettledResult(state, position, value) {
  if (state === FULFILLED) {
    return {
      state: 'fulfilled',
      value: value
    };
  } else {
    return {
      state: 'rejected',
      reason: value
    };
  }
}

/**
  `RSVP.Promise.all` accepts an array of promises, and returns a new promise which
  is fulfilled with an array of fulfillment values for the passed promises, or
  rejected with the reason of the first passed promise to be rejected. It casts all
  elements of the passed iterable to promises as it runs this algorithm.

  Example:

  ```javascript
  let promise1 = RSVP.resolve(1);
  let promise2 = RSVP.resolve(2);
  let promise3 = RSVP.resolve(3);
  let promises = [ promise1, promise2, promise3 ];

  RSVP.Promise.all(promises).then(function(array){
    // The array here would be [ 1, 2, 3 ];
  });
  ```

  If any of the `promises` given to `RSVP.all` are rejected, the first promise
  that is rejected will be given as an argument to the returned promises's
  rejection handler. For example:

  Example:

  ```javascript
  let promise1 = RSVP.resolve(1);
  let promise2 = RSVP.reject(new Error("2"));
  let promise3 = RSVP.reject(new Error("3"));
  let promises = [ promise1, promise2, promise3 ];

  RSVP.Promise.all(promises).then(function(array){
    // Code here never runs because there are rejected promises!
  }, function(error) {
    // error.message === "2"
  });
  ```

  @method all
  @static
  @param {Array} entries array of promises
  @param {String} label optional string for labeling the promise.
  Useful for tooling.
  @return {Promise} promise that is fulfilled when all `promises` have been
  fulfilled, or rejected if any of them become rejected.
  @static
*/
function all(entries, label) {
  if (!isArray(entries)) {
    return this.reject(new TypeError("Promise.all must be called with an array"), label);
  }
  return new Enumerator(this, entries, true /* abort on reject */, label).promise;
}

/**
  `RSVP.Promise.race` returns a new promise which is settled in the same way as the
  first passed promise to settle.

  Example:

  ```javascript
  let promise1 = new RSVP.Promise(function(resolve, reject){
    setTimeout(function(){
      resolve('promise 1');
    }, 200);
  });

  let promise2 = new RSVP.Promise(function(resolve, reject){
    setTimeout(function(){
      resolve('promise 2');
    }, 100);
  });

  RSVP.Promise.race([promise1, promise2]).then(function(result){
    // result === 'promise 2' because it was resolved before promise1
    // was resolved.
  });
  ```

  `RSVP.Promise.race` is deterministic in that only the state of the first
  settled promise matters. For example, even if other promises given to the
  `promises` array argument are resolved, but the first settled promise has
  become rejected before the other promises became fulfilled, the returned
  promise will become rejected:

  ```javascript
  let promise1 = new RSVP.Promise(function(resolve, reject){
    setTimeout(function(){
      resolve('promise 1');
    }, 200);
  });

  let promise2 = new RSVP.Promise(function(resolve, reject){
    setTimeout(function(){
      reject(new Error('promise 2'));
    }, 100);
  });

  RSVP.Promise.race([promise1, promise2]).then(function(result){
    // Code here never runs
  }, function(reason){
    // reason.message === 'promise 2' because promise 2 became rejected before
    // promise 1 became fulfilled
  });
  ```

  An example real-world use case is implementing timeouts:

  ```javascript
  RSVP.Promise.race([ajax('foo.json'), timeout(5000)])
  ```

  @method race
  @static
  @param {Array} entries array of promises to observe
  @param {String} label optional string for describing the promise returned.
  Useful for tooling.
  @return {Promise} a promise which settles in the same way as the first passed
  promise to settle.
*/
function race(entries, label) {
  /*jshint validthis:true */
  var Constructor = this;

  var promise = new Constructor(noop, label);

  if (!isArray(entries)) {
    reject(promise, new TypeError('Promise.race must be called with an array'));
    return promise;
  }

  for (var i = 0; promise._state === PENDING && i < entries.length; i++) {
    subscribe(Constructor.resolve(entries[i]), undefined, function (value) {
      return resolve(promise, value);
    }, function (reason) {
      return reject(promise, reason);
    });
  }

  return promise;
}

/**
  `RSVP.Promise.reject` returns a promise rejected with the passed `reason`.
  It is shorthand for the following:

  ```javascript
  let promise = new RSVP.Promise(function(resolve, reject){
    reject(new Error('WHOOPS'));
  });

  promise.then(function(value){
    // Code here doesn't run because the promise is rejected!
  }, function(reason){
    // reason.message === 'WHOOPS'
  });
  ```

  Instead of writing the above, your code now simply becomes the following:

  ```javascript
  let promise = RSVP.Promise.reject(new Error('WHOOPS'));

  promise.then(function(value){
    // Code here doesn't run because the promise is rejected!
  }, function(reason){
    // reason.message === 'WHOOPS'
  });
  ```

  @method reject
  @static
  @param {*} reason value that the returned promise will be rejected with.
  @param {String} label optional string for identifying the returned promise.
  Useful for tooling.
  @return {Promise} a promise rejected with the given `reason`.
*/
function reject$1(reason, label) {
  /*jshint validthis:true */
  var Constructor = this;
  var promise = new Constructor(noop, label);
  reject(promise, reason);
  return promise;
}

var guidKey = 'rsvp_' + now() + '-';
var counter = 0;

function needsResolver() {
  throw new TypeError('You must pass a resolver function as the first argument to the promise constructor');
}

function needsNew() {
  throw new TypeError("Failed to construct 'Promise': Please use the 'new' operator, this object constructor cannot be called as a function.");
}

/**
  Promise objects represent the eventual result of an asynchronous operation. The
  primary way of interacting with a promise is through its `then` method, which
  registers callbacks to receive either a promise’s eventual value or the reason
  why the promise cannot be fulfilled.

  Terminology
  -----------

  - `promise` is an object or function with a `then` method whose behavior conforms to this specification.
  - `thenable` is an object or function that defines a `then` method.
  - `value` is any legal JavaScript value (including undefined, a thenable, or a promise).
  - `exception` is a value that is thrown using the throw statement.
  - `reason` is a value that indicates why a promise was rejected.
  - `settled` the final resting state of a promise, fulfilled or rejected.

  A promise can be in one of three states: pending, fulfilled, or rejected.

  Promises that are fulfilled have a fulfillment value and are in the fulfilled
  state.  Promises that are rejected have a rejection reason and are in the
  rejected state.  A fulfillment value is never a thenable.

  Promises can also be said to *resolve* a value.  If this value is also a
  promise, then the original promise's settled state will match the value's
  settled state.  So a promise that *resolves* a promise that rejects will
  itself reject, and a promise that *resolves* a promise that fulfills will
  itself fulfill.


  Basic Usage:
  ------------

  ```js
  let promise = new Promise(function(resolve, reject) {
    // on success
    resolve(value);

    // on failure
    reject(reason);
  });

  promise.then(function(value) {
    // on fulfillment
  }, function(reason) {
    // on rejection
  });
  ```

  Advanced Usage:
  ---------------

  Promises shine when abstracting away asynchronous interactions such as
  `XMLHttpRequest`s.

  ```js
  function getJSON(url) {
    return new Promise(function(resolve, reject){
      let xhr = new XMLHttpRequest();

      xhr.open('GET', url);
      xhr.onreadystatechange = handler;
      xhr.responseType = 'json';
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.send();

      function handler() {
        if (this.readyState === this.DONE) {
          if (this.status === 200) {
            resolve(this.response);
          } else {
            reject(new Error('getJSON: `' + url + '` failed with status: [' + this.status + ']'));
          }
        }
      };
    });
  }

  getJSON('/posts.json').then(function(json) {
    // on fulfillment
  }, function(reason) {
    // on rejection
  });
  ```

  Unlike callbacks, promises are great composable primitives.

  ```js
  Promise.all([
    getJSON('/posts'),
    getJSON('/comments')
  ]).then(function(values){
    values[0] // => postsJSON
    values[1] // => commentsJSON

    return values;
  });
  ```

  @class RSVP.Promise
  @param {function} resolver
  @param {String} label optional string for labeling the promise.
  Useful for tooling.
  @constructor
*/

var Promise = function () {
  function Promise(resolver, label) {
    this._id = counter++;
    this._label = label;
    this._state = undefined;
    this._result = undefined;
    this._subscribers = [];

    config.instrument && instrument('created', this);

    if (noop !== resolver) {
      typeof resolver !== 'function' && needsResolver();
      this instanceof Promise ? initializePromise(this, resolver) : needsNew();
    }
  }

  Promise.prototype._onError = function _onError(reason) {
    var _this = this;

    config.after(function () {
      if (_this._onError) {
        config.trigger('error', reason, _this._label);
      }
    });
  };

  /**
    `catch` is simply sugar for `then(undefined, onRejection)` which makes it the same
    as the catch block of a try/catch statement.
  
    ```js
    function findAuthor(){
      throw new Error('couldn\'t find that author');
    }
  
    // synchronous
    try {
      findAuthor();
    } catch(reason) {
      // something went wrong
    }
  
    // async with promises
    findAuthor().catch(function(reason){
      // something went wrong
    });
    ```
  
    @method catch
    @param {Function} onRejection
    @param {String} label optional string for labeling the promise.
    Useful for tooling.
    @return {Promise}
  */


  Promise.prototype.catch = function _catch(onRejection, label) {
    return this.then(undefined, onRejection, label);
  };

  /**
    `finally` will be invoked regardless of the promise's fate just as native
    try/catch/finally behaves
  
    Synchronous example:
  
    ```js
    findAuthor() {
      if (Math.random() > 0.5) {
        throw new Error();
      }
      return new Author();
    }
  
    try {
      return findAuthor(); // succeed or fail
    } catch(error) {
      return findOtherAuthor();
    } finally {
      // always runs
      // doesn't affect the return value
    }
    ```
  
    Asynchronous example:
  
    ```js
    findAuthor().catch(function(reason){
      return findOtherAuthor();
    }).finally(function(){
      // author was either found, or not
    });
    ```
  
    @method finally
    @param {Function} callback
    @param {String} label optional string for labeling the promise.
    Useful for tooling.
    @return {Promise}
  */


  Promise.prototype.finally = function _finally(callback, label) {
    var promise = this;
    var constructor = promise.constructor;

    return promise.then(function (value) {
      return constructor.resolve(callback()).then(function () {
        return value;
      });
    }, function (reason) {
      return constructor.resolve(callback()).then(function () {
        throw reason;
      });
    }, label);
  };

  return Promise;
}();



Promise.cast = resolve$1; // deprecated
Promise.all = all;
Promise.race = race;
Promise.resolve = resolve$1;
Promise.reject = reject$1;

Promise.prototype._guidKey = guidKey;

/**
  The primary way of interacting with a promise is through its `then` method,
  which registers callbacks to receive either a promise's eventual value or the
  reason why the promise cannot be fulfilled.

  ```js
  findUser().then(function(user){
    // user is available
  }, function(reason){
    // user is unavailable, and you are given the reason why
  });
  ```

  Chaining
  --------

  The return value of `then` is itself a promise.  This second, 'downstream'
  promise is resolved with the return value of the first promise's fulfillment
  or rejection handler, or rejected if the handler throws an exception.

  ```js
  findUser().then(function (user) {
    return user.name;
  }, function (reason) {
    return 'default name';
  }).then(function (userName) {
    // If `findUser` fulfilled, `userName` will be the user's name, otherwise it
    // will be `'default name'`
  });

  findUser().then(function (user) {
    throw new Error('Found user, but still unhappy');
  }, function (reason) {
    throw new Error('`findUser` rejected and we\'re unhappy');
  }).then(function (value) {
    // never reached
  }, function (reason) {
    // if `findUser` fulfilled, `reason` will be 'Found user, but still unhappy'.
    // If `findUser` rejected, `reason` will be '`findUser` rejected and we\'re unhappy'.
  });
  ```
  If the downstream promise does not specify a rejection handler, rejection reasons will be propagated further downstream.

  ```js
  findUser().then(function (user) {
    throw new PedagogicalException('Upstream error');
  }).then(function (value) {
    // never reached
  }).then(function (value) {
    // never reached
  }, function (reason) {
    // The `PedgagocialException` is propagated all the way down to here
  });
  ```

  Assimilation
  ------------

  Sometimes the value you want to propagate to a downstream promise can only be
  retrieved asynchronously. This can be achieved by returning a promise in the
  fulfillment or rejection handler. The downstream promise will then be pending
  until the returned promise is settled. This is called *assimilation*.

  ```js
  findUser().then(function (user) {
    return findCommentsByAuthor(user);
  }).then(function (comments) {
    // The user's comments are now available
  });
  ```

  If the assimliated promise rejects, then the downstream promise will also reject.

  ```js
  findUser().then(function (user) {
    return findCommentsByAuthor(user);
  }).then(function (comments) {
    // If `findCommentsByAuthor` fulfills, we'll have the value here
  }, function (reason) {
    // If `findCommentsByAuthor` rejects, we'll have the reason here
  });
  ```

  Simple Example
  --------------

  Synchronous Example

  ```javascript
  let result;

  try {
    result = findResult();
    // success
  } catch(reason) {
    // failure
  }
  ```

  Errback Example

  ```js
  findResult(function(result, err){
    if (err) {
      // failure
    } else {
      // success
    }
  });
  ```

  Promise Example;

  ```javascript
  findResult().then(function(result){
    // success
  }, function(reason){
    // failure
  });
  ```

  Advanced Example
  --------------

  Synchronous Example

  ```javascript
  let author, books;

  try {
    author = findAuthor();
    books  = findBooksByAuthor(author);
    // success
  } catch(reason) {
    // failure
  }
  ```

  Errback Example

  ```js

  function foundBooks(books) {

  }

  function failure(reason) {

  }

  findAuthor(function(author, err){
    if (err) {
      failure(err);
      // failure
    } else {
      try {
        findBoooksByAuthor(author, function(books, err) {
          if (err) {
            failure(err);
          } else {
            try {
              foundBooks(books);
            } catch(reason) {
              failure(reason);
            }
          }
        });
      } catch(error) {
        failure(err);
      }
      // success
    }
  });
  ```

  Promise Example;

  ```javascript
  findAuthor().
    then(findBooksByAuthor).
    then(function(books){
      // found books
  }).catch(function(reason){
    // something went wrong
  });
  ```

  @method then
  @param {Function} onFulfillment
  @param {Function} onRejection
  @param {String} label optional string for labeling the promise.
  Useful for tooling.
  @return {Promise}
*/
Promise.prototype.then = then;

function Result() {
  this.value = undefined;
}

var ERROR = new Result();
var GET_THEN_ERROR$1 = new Result();

function getThen$1(obj) {
  try {
    return obj.then;
  } catch (error) {
    ERROR.value = error;
    return ERROR;
  }
}

function tryApply(f, s, a) {
  try {
    f.apply(s, a);
  } catch (error) {
    ERROR.value = error;
    return ERROR;
  }
}

function makeObject(_, argumentNames) {
  var obj = {};
  var length = _.length;
  var args = new Array(length);

  for (var x = 0; x < length; x++) {
    args[x] = _[x];
  }

  for (var i = 0; i < argumentNames.length; i++) {
    var name = argumentNames[i];
    obj[name] = args[i + 1];
  }

  return obj;
}

function arrayResult(_) {
  var length = _.length;
  var args = new Array(length - 1);

  for (var i = 1; i < length; i++) {
    args[i - 1] = _[i];
  }

  return args;
}

function wrapThenable(then, promise) {
  return {
    then: function (onFulFillment, onRejection) {
      return then.call(promise, onFulFillment, onRejection);
    }
  };
}

/**
  `RSVP.denodeify` takes a 'node-style' function and returns a function that
  will return an `RSVP.Promise`. You can use `denodeify` in Node.js or the
  browser when you'd prefer to use promises over using callbacks. For example,
  `denodeify` transforms the following:

  ```javascript
  let fs = require('fs');

  fs.readFile('myfile.txt', function(err, data){
    if (err) return handleError(err);
    handleData(data);
  });
  ```

  into:

  ```javascript
  let fs = require('fs');
  let readFile = RSVP.denodeify(fs.readFile);

  readFile('myfile.txt').then(handleData, handleError);
  ```

  If the node function has multiple success parameters, then `denodeify`
  just returns the first one:

  ```javascript
  let request = RSVP.denodeify(require('request'));

  request('http://example.com').then(function(res) {
    // ...
  });
  ```

  However, if you need all success parameters, setting `denodeify`'s
  second parameter to `true` causes it to return all success parameters
  as an array:

  ```javascript
  let request = RSVP.denodeify(require('request'), true);

  request('http://example.com').then(function(result) {
    // result[0] -> res
    // result[1] -> body
  });
  ```

  Or if you pass it an array with names it returns the parameters as a hash:

  ```javascript
  let request = RSVP.denodeify(require('request'), ['res', 'body']);

  request('http://example.com').then(function(result) {
    // result.res
    // result.body
  });
  ```

  Sometimes you need to retain the `this`:

  ```javascript
  let app = require('express')();
  let render = RSVP.denodeify(app.render.bind(app));
  ```

  The denodified function inherits from the original function. It works in all
  environments, except IE 10 and below. Consequently all properties of the original
  function are available to you. However, any properties you change on the
  denodeified function won't be changed on the original function. Example:

  ```javascript
  let request = RSVP.denodeify(require('request')),
      cookieJar = request.jar(); // <- Inheritance is used here

  request('http://example.com', {jar: cookieJar}).then(function(res) {
    // cookieJar.cookies holds now the cookies returned by example.com
  });
  ```

  Using `denodeify` makes it easier to compose asynchronous operations instead
  of using callbacks. For example, instead of:

  ```javascript
  let fs = require('fs');

  fs.readFile('myfile.txt', function(err, data){
    if (err) { ... } // Handle error
    fs.writeFile('myfile2.txt', data, function(err){
      if (err) { ... } // Handle error
      console.log('done')
    });
  });
  ```

  you can chain the operations together using `then` from the returned promise:

  ```javascript
  let fs = require('fs');
  let readFile = RSVP.denodeify(fs.readFile);
  let writeFile = RSVP.denodeify(fs.writeFile);

  readFile('myfile.txt').then(function(data){
    return writeFile('myfile2.txt', data);
  }).then(function(){
    console.log('done')
  }).catch(function(error){
    // Handle error
  });
  ```

  @method denodeify
  @static
  @for RSVP
  @param {Function} nodeFunc a 'node-style' function that takes a callback as
  its last argument. The callback expects an error to be passed as its first
  argument (if an error occurred, otherwise null), and the value from the
  operation as its second argument ('function(err, value){ }').
  @param {Boolean|Array} [options] An optional paramter that if set
  to `true` causes the promise to fulfill with the callback's success arguments
  as an array. This is useful if the node function has multiple success
  paramters. If you set this paramter to an array with names, the promise will
  fulfill with a hash with these names as keys and the success parameters as
  values.
  @return {Function} a function that wraps `nodeFunc` to return an
  `RSVP.Promise`
  @static
*/
function denodeify(nodeFunc, options) {
  var fn = function () {
    var self = this;
    var l = arguments.length;
    var args = new Array(l + 1);
    var promiseInput = false;

    for (var i = 0; i < l; ++i) {
      var arg = arguments[i];

      if (!promiseInput) {
        // TODO: clean this up
        promiseInput = needsPromiseInput(arg);
        if (promiseInput === GET_THEN_ERROR$1) {
          var p = new Promise(noop);
          reject(p, GET_THEN_ERROR$1.value);
          return p;
        } else if (promiseInput && promiseInput !== true) {
          arg = wrapThenable(promiseInput, arg);
        }
      }
      args[i] = arg;
    }

    var promise = new Promise(noop);

    args[l] = function (err, val) {
      if (err) reject(promise, err);else if (options === undefined) resolve(promise, val);else if (options === true) resolve(promise, arrayResult(arguments));else if (isArray(options)) resolve(promise, makeObject(arguments, options));else resolve(promise, val);
    };

    if (promiseInput) {
      return handlePromiseInput(promise, args, nodeFunc, self);
    } else {
      return handleValueInput(promise, args, nodeFunc, self);
    }
  };

  fn.__proto__ = nodeFunc;

  return fn;
}

function handleValueInput(promise, args, nodeFunc, self) {
  var result = tryApply(nodeFunc, self, args);
  if (result === ERROR) {
    reject(promise, result.value);
  }
  return promise;
}

function handlePromiseInput(promise, args, nodeFunc, self) {
  return Promise.all(args).then(function (args) {
    var result = tryApply(nodeFunc, self, args);
    if (result === ERROR) {
      reject(promise, result.value);
    }
    return promise;
  });
}

function needsPromiseInput(arg) {
  if (arg && typeof arg === 'object') {
    if (arg.constructor === Promise) {
      return true;
    } else {
      return getThen$1(arg);
    }
  } else {
    return false;
  }
}

/**
  This is a convenient alias for `RSVP.Promise.all`.

  @method all
  @static
  @for RSVP
  @param {Array} array Array of promises.
  @param {String} label An optional label. This is useful
  for tooling.
*/
function all$1(array, label) {
  return Promise.all(array, label);
}

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var AllSettled = function (_Enumerator) {
  _inherits(AllSettled, _Enumerator);

  function AllSettled(Constructor, entries, label) {
    return _possibleConstructorReturn(this, _Enumerator.call(this, Constructor, entries, false /* don't abort on reject */, label));
  }

  return AllSettled;
}(Enumerator);

AllSettled.prototype._makeResult = makeSettledResult;

/**
`RSVP.allSettled` is similar to `RSVP.all`, but instead of implementing
a fail-fast method, it waits until all the promises have returned and
shows you all the results. This is useful if you want to handle multiple
promises' failure states together as a set.
 Returns a promise that is fulfilled when all the given promises have been
settled. The return promise is fulfilled with an array of the states of
the promises passed into the `promises` array argument.
 Each state object will either indicate fulfillment or rejection, and
provide the corresponding value or reason. The states will take one of
the following formats:
 ```javascript
{ state: 'fulfilled', value: value }
  or
{ state: 'rejected', reason: reason }
```
 Example:
 ```javascript
let promise1 = RSVP.Promise.resolve(1);
let promise2 = RSVP.Promise.reject(new Error('2'));
let promise3 = RSVP.Promise.reject(new Error('3'));
let promises = [ promise1, promise2, promise3 ];
 RSVP.allSettled(promises).then(function(array){
  // array == [
  //   { state: 'fulfilled', value: 1 },
  //   { state: 'rejected', reason: Error },
  //   { state: 'rejected', reason: Error }
  // ]
  // Note that for the second item, reason.message will be '2', and for the
  // third item, reason.message will be '3'.
}, function(error) {
  // Not run. (This block would only be called if allSettled had failed,
  // for instance if passed an incorrect argument type.)
});
```
 @method allSettled
@static
@for RSVP
@param {Array} entries
@param {String} label - optional string that describes the promise.
Useful for tooling.
@return {Promise} promise that is fulfilled with an array of the settled
states of the constituent promises.
*/

function allSettled(entries, label) {
  if (!isArray(entries)) {
    return Promise.reject(new TypeError("Promise.allSettled must be called with an array"), label);
  }

  return new AllSettled(Promise, entries, label).promise;
}

/**
  This is a convenient alias for `RSVP.Promise.race`.

  @method race
  @static
  @for RSVP
  @param {Array} array Array of promises.
  @param {String} label An optional label. This is useful
  for tooling.
 */
function race$1(array, label) {
  return Promise.race(array, label);
}

function _possibleConstructorReturn$1(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits$1(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var hasOwnProperty = Object.prototype.hasOwnProperty;

var PromiseHash = function (_Enumerator) {
  _inherits$1(PromiseHash, _Enumerator);

  function PromiseHash(Constructor, object) {
    var abortOnReject = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;
    var label = arguments[3];
    return _possibleConstructorReturn$1(this, _Enumerator.call(this, Constructor, object, abortOnReject, label));
  }

  PromiseHash.prototype._init = function _init(Constructor, object) {
    this._result = {};

    this._enumerate(object);
    if (this._remaining === 0) {
      fulfill(this.promise, this._result);
    }
  };

  PromiseHash.prototype._enumerate = function _enumerate(input) {
    var promise = this.promise;
    var results = [];

    for (var key in input) {
      if (hasOwnProperty.call(input, key)) {
        results.push({
          position: key,
          entry: input[key]
        });
      }
    }

    var length = results.length;
    this._remaining = length;
    var result = void 0;

    for (var i = 0; promise._state === PENDING && i < length; i++) {
      result = results[i];
      this._eachEntry(result.entry, result.position);
    }
  };

  return PromiseHash;
}(Enumerator);

/**
  `RSVP.hash` is similar to `RSVP.all`, but takes an object instead of an array
  for its `promises` argument.

  Returns a promise that is fulfilled when all the given promises have been
  fulfilled, or rejected if any of them become rejected. The returned promise
  is fulfilled with a hash that has the same key names as the `promises` object
  argument. If any of the values in the object are not promises, they will
  simply be copied over to the fulfilled object.

  Example:

  ```javascript
  let promises = {
    myPromise: RSVP.resolve(1),
    yourPromise: RSVP.resolve(2),
    theirPromise: RSVP.resolve(3),
    notAPromise: 4
  };

  RSVP.hash(promises).then(function(hash){
    // hash here is an object that looks like:
    // {
    //   myPromise: 1,
    //   yourPromise: 2,
    //   theirPromise: 3,
    //   notAPromise: 4
    // }
  });
  ````

  If any of the `promises` given to `RSVP.hash` are rejected, the first promise
  that is rejected will be given as the reason to the rejection handler.

  Example:

  ```javascript
  let promises = {
    myPromise: RSVP.resolve(1),
    rejectedPromise: RSVP.reject(new Error('rejectedPromise')),
    anotherRejectedPromise: RSVP.reject(new Error('anotherRejectedPromise')),
  };

  RSVP.hash(promises).then(function(hash){
    // Code here never runs because there are rejected promises!
  }, function(reason) {
    // reason.message === 'rejectedPromise'
  });
  ```

  An important note: `RSVP.hash` is intended for plain JavaScript objects that
  are just a set of keys and values. `RSVP.hash` will NOT preserve prototype
  chains.

  Example:

  ```javascript
  function MyConstructor(){
    this.example = RSVP.resolve('Example');
  }

  MyConstructor.prototype = {
    protoProperty: RSVP.resolve('Proto Property')
  };

  let myObject = new MyConstructor();

  RSVP.hash(myObject).then(function(hash){
    // protoProperty will not be present, instead you will just have an
    // object that looks like:
    // {
    //   example: 'Example'
    // }
    //
    // hash.hasOwnProperty('protoProperty'); // false
    // 'undefined' === typeof hash.protoProperty
  });
  ```

  @method hash
  @static
  @for RSVP
  @param {Object} object
  @param {String} label optional string that describes the promise.
  Useful for tooling.
  @return {Promise} promise that is fulfilled when all properties of `promises`
  have been fulfilled, or rejected if any of them become rejected.
*/
function hash(object, label) {
  if (!isObject(object)) {
    return Promise.reject(new TypeError("Promise.hash must be called with an object"), label);
  }

  return new PromiseHash(Promise, object, label).promise;
}

function _possibleConstructorReturn$2(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits$2(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var HashSettled = function (_PromiseHash) {
  _inherits$2(HashSettled, _PromiseHash);

  function HashSettled(Constructor, object, label) {
    return _possibleConstructorReturn$2(this, _PromiseHash.call(this, Constructor, object, false, label));
  }

  return HashSettled;
}(PromiseHash);

HashSettled.prototype._makeResult = makeSettledResult;

/**
  `RSVP.hashSettled` is similar to `RSVP.allSettled`, but takes an object
  instead of an array for its `promises` argument.

  Unlike `RSVP.all` or `RSVP.hash`, which implement a fail-fast method,
  but like `RSVP.allSettled`, `hashSettled` waits until all the
  constituent promises have returned and then shows you all the results
  with their states and values/reasons. This is useful if you want to
  handle multiple promises' failure states together as a set.

  Returns a promise that is fulfilled when all the given promises have been
  settled, or rejected if the passed parameters are invalid.

  The returned promise is fulfilled with a hash that has the same key names as
  the `promises` object argument. If any of the values in the object are not
  promises, they will be copied over to the fulfilled object and marked with state
  'fulfilled'.

  Example:

  ```javascript
  let promises = {
    myPromise: RSVP.Promise.resolve(1),
    yourPromise: RSVP.Promise.resolve(2),
    theirPromise: RSVP.Promise.resolve(3),
    notAPromise: 4
  };

  RSVP.hashSettled(promises).then(function(hash){
    // hash here is an object that looks like:
    // {
    //   myPromise: { state: 'fulfilled', value: 1 },
    //   yourPromise: { state: 'fulfilled', value: 2 },
    //   theirPromise: { state: 'fulfilled', value: 3 },
    //   notAPromise: { state: 'fulfilled', value: 4 }
    // }
  });
  ```

  If any of the `promises` given to `RSVP.hash` are rejected, the state will
  be set to 'rejected' and the reason for rejection provided.

  Example:

  ```javascript
  let promises = {
    myPromise: RSVP.Promise.resolve(1),
    rejectedPromise: RSVP.Promise.reject(new Error('rejection')),
    anotherRejectedPromise: RSVP.Promise.reject(new Error('more rejection')),
  };

  RSVP.hashSettled(promises).then(function(hash){
    // hash here is an object that looks like:
    // {
    //   myPromise:              { state: 'fulfilled', value: 1 },
    //   rejectedPromise:        { state: 'rejected', reason: Error },
    //   anotherRejectedPromise: { state: 'rejected', reason: Error },
    // }
    // Note that for rejectedPromise, reason.message == 'rejection',
    // and for anotherRejectedPromise, reason.message == 'more rejection'.
  });
  ```

  An important note: `RSVP.hashSettled` is intended for plain JavaScript objects that
  are just a set of keys and values. `RSVP.hashSettled` will NOT preserve prototype
  chains.

  Example:

  ```javascript
  function MyConstructor(){
    this.example = RSVP.Promise.resolve('Example');
  }

  MyConstructor.prototype = {
    protoProperty: RSVP.Promise.resolve('Proto Property')
  };

  let myObject = new MyConstructor();

  RSVP.hashSettled(myObject).then(function(hash){
    // protoProperty will not be present, instead you will just have an
    // object that looks like:
    // {
    //   example: { state: 'fulfilled', value: 'Example' }
    // }
    //
    // hash.hasOwnProperty('protoProperty'); // false
    // 'undefined' === typeof hash.protoProperty
  });
  ```

  @method hashSettled
  @for RSVP
  @param {Object} object
  @param {String} label optional string that describes the promise.
  Useful for tooling.
  @return {Promise} promise that is fulfilled when when all properties of `promises`
  have been settled.
  @static
*/

function hashSettled(object, label) {
  if (!isObject(object)) {
    return Promise.reject(new TypeError("RSVP.hashSettled must be called with an object"), label);
  }

  return new HashSettled(Promise, object, false, label).promise;
}

/**
  `RSVP.rethrow` will rethrow an error on the next turn of the JavaScript event
  loop in order to aid debugging.

  Promises A+ specifies that any exceptions that occur with a promise must be
  caught by the promises implementation and bubbled to the last handler. For
  this reason, it is recommended that you always specify a second rejection
  handler function to `then`. However, `RSVP.rethrow` will throw the exception
  outside of the promise, so it bubbles up to your console if in the browser,
  or domain/cause uncaught exception in Node. `rethrow` will also throw the
  error again so the error can be handled by the promise per the spec.

  ```javascript
  function throws(){
    throw new Error('Whoops!');
  }

  let promise = new RSVP.Promise(function(resolve, reject){
    throws();
  });

  promise.catch(RSVP.rethrow).then(function(){
    // Code here doesn't run because the promise became rejected due to an
    // error!
  }, function (err){
    // handle the error here
  });
  ```

  The 'Whoops' error will be thrown on the next turn of the event loop
  and you can watch for it in your console. You can also handle it using a
  rejection handler given to `.then` or `.catch` on the returned promise.

  @method rethrow
  @static
  @for RSVP
  @param {Error} reason reason the promise became rejected.
  @throws Error
  @static
*/
function rethrow(reason) {
  setTimeout(function () {
    throw reason;
  });
  throw reason;
}

/**
  `RSVP.defer` returns an object similar to jQuery's `$.Deferred`.
  `RSVP.defer` should be used when porting over code reliant on `$.Deferred`'s
  interface. New code should use the `RSVP.Promise` constructor instead.

  The object returned from `RSVP.defer` is a plain object with three properties:

  * promise - an `RSVP.Promise`.
  * reject - a function that causes the `promise` property on this object to
    become rejected
  * resolve - a function that causes the `promise` property on this object to
    become fulfilled.

  Example:

   ```javascript
   let deferred = RSVP.defer();

   deferred.resolve("Success!");

   deferred.promise.then(function(value){
     // value here is "Success!"
   });
   ```

  @method defer
  @static
  @for RSVP
  @param {String} label optional string for labeling the promise.
  Useful for tooling.
  @return {Object}
 */

function defer(label) {
  var deferred = { resolve: undefined, reject: undefined };

  deferred.promise = new Promise(function (resolve, reject) {
    deferred.resolve = resolve;
    deferred.reject = reject;
  }, label);

  return deferred;
}

/**
 `RSVP.map` is similar to JavaScript's native `map` method, except that it
  waits for all promises to become fulfilled before running the `mapFn` on
  each item in given to `promises`. `RSVP.map` returns a promise that will
  become fulfilled with the result of running `mapFn` on the values the promises
  become fulfilled with.

  For example:

  ```javascript

  let promise1 = RSVP.resolve(1);
  let promise2 = RSVP.resolve(2);
  let promise3 = RSVP.resolve(3);
  let promises = [ promise1, promise2, promise3 ];

  let mapFn = function(item){
    return item + 1;
  };

  RSVP.map(promises, mapFn).then(function(result){
    // result is [ 2, 3, 4 ]
  });
  ```

  If any of the `promises` given to `RSVP.map` are rejected, the first promise
  that is rejected will be given as an argument to the returned promise's
  rejection handler. For example:

  ```javascript
  let promise1 = RSVP.resolve(1);
  let promise2 = RSVP.reject(new Error('2'));
  let promise3 = RSVP.reject(new Error('3'));
  let promises = [ promise1, promise2, promise3 ];

  let mapFn = function(item){
    return item + 1;
  };

  RSVP.map(promises, mapFn).then(function(array){
    // Code here never runs because there are rejected promises!
  }, function(reason) {
    // reason.message === '2'
  });
  ```

  `RSVP.map` will also wait if a promise is returned from `mapFn`. For example,
  say you want to get all comments from a set of blog posts, but you need
  the blog posts first because they contain a url to those comments.

  ```javscript

  let mapFn = function(blogPost){
    // getComments does some ajax and returns an RSVP.Promise that is fulfilled
    // with some comments data
    return getComments(blogPost.comments_url);
  };

  // getBlogPosts does some ajax and returns an RSVP.Promise that is fulfilled
  // with some blog post data
  RSVP.map(getBlogPosts(), mapFn).then(function(comments){
    // comments is the result of asking the server for the comments
    // of all blog posts returned from getBlogPosts()
  });
  ```

  @method map
  @static
  @for RSVP
  @param {Array} promises
  @param {Function} mapFn function to be called on each fulfilled promise.
  @param {String} label optional string for labeling the promise.
  Useful for tooling.
  @return {Promise} promise that is fulfilled with the result of calling
  `mapFn` on each fulfilled promise or value when they become fulfilled.
   The promise will be rejected if any of the given `promises` become rejected.
  @static
*/
function map(promises, mapFn, label) {
  if (!isArray(promises)) {
    return Promise.reject(new TypeError("RSVP.map must be called with an array"), label);
  }

  if (!isFunction(mapFn)) {
    return Promise.reject(new TypeError("RSVP.map expects a function as a second argument"), label);
  }

  return Promise.all(promises, label).then(function (values) {
    var length = values.length;
    var results = new Array(length);

    for (var i = 0; i < length; i++) {
      results[i] = mapFn(values[i]);
    }

    return Promise.all(results, label);
  });
}

/**
  This is a convenient alias for `RSVP.Promise.resolve`.

  @method resolve
  @static
  @for RSVP
  @param {*} value value that the returned promise will be resolved with
  @param {String} label optional string for identifying the returned promise.
  Useful for tooling.
  @return {Promise} a promise that will become fulfilled with the given
  `value`
*/
function resolve$2(value, label) {
  return Promise.resolve(value, label);
}

/**
  This is a convenient alias for `RSVP.Promise.reject`.

  @method reject
  @static
  @for RSVP
  @param {*} reason value that the returned promise will be rejected with.
  @param {String} label optional string for identifying the returned promise.
  Useful for tooling.
  @return {Promise} a promise rejected with the given `reason`.
*/
function reject$2(reason, label) {
  return Promise.reject(reason, label);
}

/**
 `RSVP.filter` is similar to JavaScript's native `filter` method, except that it
  waits for all promises to become fulfilled before running the `filterFn` on
  each item in given to `promises`. `RSVP.filter` returns a promise that will
  become fulfilled with the result of running `filterFn` on the values the
  promises become fulfilled with.

  For example:

  ```javascript

  let promise1 = RSVP.resolve(1);
  let promise2 = RSVP.resolve(2);
  let promise3 = RSVP.resolve(3);

  let promises = [promise1, promise2, promise3];

  let filterFn = function(item){
    return item > 1;
  };

  RSVP.filter(promises, filterFn).then(function(result){
    // result is [ 2, 3 ]
  });
  ```

  If any of the `promises` given to `RSVP.filter` are rejected, the first promise
  that is rejected will be given as an argument to the returned promise's
  rejection handler. For example:

  ```javascript
  let promise1 = RSVP.resolve(1);
  let promise2 = RSVP.reject(new Error('2'));
  let promise3 = RSVP.reject(new Error('3'));
  let promises = [ promise1, promise2, promise3 ];

  let filterFn = function(item){
    return item > 1;
  };

  RSVP.filter(promises, filterFn).then(function(array){
    // Code here never runs because there are rejected promises!
  }, function(reason) {
    // reason.message === '2'
  });
  ```

  `RSVP.filter` will also wait for any promises returned from `filterFn`.
  For instance, you may want to fetch a list of users then return a subset
  of those users based on some asynchronous operation:

  ```javascript

  let alice = { name: 'alice' };
  let bob   = { name: 'bob' };
  let users = [ alice, bob ];

  let promises = users.map(function(user){
    return RSVP.resolve(user);
  });

  let filterFn = function(user){
    // Here, Alice has permissions to create a blog post, but Bob does not.
    return getPrivilegesForUser(user).then(function(privs){
      return privs.can_create_blog_post === true;
    });
  };
  RSVP.filter(promises, filterFn).then(function(users){
    // true, because the server told us only Alice can create a blog post.
    users.length === 1;
    // false, because Alice is the only user present in `users`
    users[0] === bob;
  });
  ```

  @method filter
  @static
  @for RSVP
  @param {Array} promises
  @param {Function} filterFn - function to be called on each resolved value to
  filter the final results.
  @param {String} label optional string describing the promise. Useful for
  tooling.
  @return {Promise}
*/

function resolveAll(promises, label) {
  return Promise.all(promises, label);
}

function resolveSingle(promise, label) {
  return Promise.resolve(promise, label).then(function (promises) {
    return resolveAll(promises, label);
  });
}

function filter(promises, filterFn, label) {
  if (!isArray(promises) && !(isObject(promises) && promises.then !== undefined)) {
    return Promise.reject(new TypeError("RSVP.filter must be called with an array or promise"), label);
  }

  if (!isFunction(filterFn)) {
    return Promise.reject(new TypeError("RSVP.filter expects function as a second argument"), label);
  }

  var promise = isArray(promises) ? resolveAll(promises, label) : resolveSingle(promises, label);
  return promise.then(function (values) {
    var length = values.length;
    var filtered = new Array(length);

    for (var i = 0; i < length; i++) {
      filtered[i] = filterFn(values[i]);
    }

    return resolveAll(filtered, label).then(function (filtered) {
      var results = new Array(length);
      var newLength = 0;

      for (var _i = 0; _i < length; _i++) {
        if (filtered[_i]) {
          results[newLength] = values[_i];
          newLength++;
        }
      }

      results.length = newLength;

      return results;
    });
  });
}

var len = 0;
var vertxNext = void 0;
function asap(callback, arg) {
  queue$1[len] = callback;
  queue$1[len + 1] = arg;
  len += 2;
  if (len === 2) {
    // If len is 1, that means that we need to schedule an async flush.
    // If additional callbacks are queued before the queue is flushed, they
    // will be processed by this flush that we are scheduling.
    scheduleFlush$1();
  }
}

var browserWindow = typeof window !== 'undefined' ? window : undefined;
var browserGlobal = browserWindow || {};
var BrowserMutationObserver = browserGlobal.MutationObserver || browserGlobal.WebKitMutationObserver;
var isNode = typeof self === 'undefined' && typeof process !== 'undefined' && {}.toString.call(process) === '[object process]';

// test for web worker but not in IE10
var isWorker = typeof Uint8ClampedArray !== 'undefined' && typeof importScripts !== 'undefined' && typeof MessageChannel !== 'undefined';

// node
function useNextTick() {
  var nextTick = process.nextTick;
  // node version 0.10.x displays a deprecation warning when nextTick is used recursively
  // setImmediate should be used instead instead
  var version = process.versions.node.match(/^(?:(\d+)\.)?(?:(\d+)\.)?(\*|\d+)$/);
  if (Array.isArray(version) && version[1] === '0' && version[2] === '10') {
    nextTick = setImmediate;
  }
  return function () {
    return nextTick(flush);
  };
}

// vertx
function useVertxTimer() {
  if (typeof vertxNext !== 'undefined') {
    return function () {
      vertxNext(flush);
    };
  }
  return useSetTimeout();
}

function useMutationObserver() {
  var iterations = 0;
  var observer = new BrowserMutationObserver(flush);
  var node = document.createTextNode('');
  observer.observe(node, { characterData: true });

  return function () {
    return node.data = iterations = ++iterations % 2;
  };
}

// web worker
function useMessageChannel() {
  var channel = new MessageChannel();
  channel.port1.onmessage = flush;
  return function () {
    return channel.port2.postMessage(0);
  };
}

function useSetTimeout() {
  return function () {
    return setTimeout(flush, 1);
  };
}

var queue$1 = new Array(1000);

function flush() {
  for (var i = 0; i < len; i += 2) {
    var callback = queue$1[i];
    var arg = queue$1[i + 1];

    callback(arg);

    queue$1[i] = undefined;
    queue$1[i + 1] = undefined;
  }

  len = 0;
}

function attemptVertex() {
  try {
    var r = require;
    var vertx = r('vertx');
    vertxNext = vertx.runOnLoop || vertx.runOnContext;
    return useVertxTimer();
  } catch (e) {
    return useSetTimeout();
  }
}

var scheduleFlush$1 = void 0;
// Decide what async method to use to triggering processing of queued callbacks:
if (isNode) {
  scheduleFlush$1 = useNextTick();
} else if (BrowserMutationObserver) {
  scheduleFlush$1 = useMutationObserver();
} else if (isWorker) {
  scheduleFlush$1 = useMessageChannel();
} else if (browserWindow === undefined && typeof require === 'function') {
  scheduleFlush$1 = attemptVertex();
} else {
  scheduleFlush$1 = useSetTimeout();
}

var platform = void 0;

/* global self */
if (typeof self === 'object') {
  platform = self;

  /* global global */
} else if (typeof global === 'object') {
  platform = global;
} else {
  throw new Error('no global: `self` or `global` found');
}

var _asap$cast$Promise$Ev;

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

// defaults
config.async = asap;
config.after = function (cb) {
  return setTimeout(cb, 0);
};
var cast = resolve$2;

var async = function (callback, arg) {
  return config.async(callback, arg);
};

function on() {
  config['on'].apply(config, arguments);
}

function off() {
  config['off'].apply(config, arguments);
}

// Set up instrumentation through `window.__PROMISE_INTRUMENTATION__`
if (typeof window !== 'undefined' && typeof window['__PROMISE_INSTRUMENTATION__'] === 'object') {
  var callbacks = window['__PROMISE_INSTRUMENTATION__'];
  configure('instrument', true);
  for (var eventName in callbacks) {
    if (callbacks.hasOwnProperty(eventName)) {
      on(eventName, callbacks[eventName]);
    }
  }
}

// the default export here is for backwards compat:
//   https://github.com/tildeio/rsvp.js/issues/434
var rsvp = (_asap$cast$Promise$Ev = {
  asap: asap,
  cast: cast,
  Promise: Promise,
  EventTarget: EventTarget,
  all: all$1,
  allSettled: allSettled,
  race: race$1,
  hash: hash,
  hashSettled: hashSettled,
  rethrow: rethrow,
  defer: defer,
  denodeify: denodeify,
  configure: configure,
  on: on,
  off: off,
  resolve: resolve$2,
  reject: reject$2,
  map: map
}, _defineProperty(_asap$cast$Promise$Ev, 'async', async), _defineProperty(_asap$cast$Promise$Ev, 'filter', filter), _asap$cast$Promise$Ev);

exports['default'] = rsvp;
exports.asap = asap;
exports.cast = cast;
exports.Promise = Promise;
exports.EventTarget = EventTarget;
exports.all = all$1;
exports.allSettled = allSettled;
exports.race = race$1;
exports.hash = hash;
exports.hashSettled = hashSettled;
exports.rethrow = rethrow;
exports.defer = defer;
exports.denodeify = denodeify;
exports.configure = configure;
exports.on = on;
exports.off = off;
exports.resolve = resolve$2;
exports.reject = reject$2;
exports.map = map;
exports.async = async;
exports.filter = filter;

Object.defineProperty(exports, '__esModule', { value: true });

})));

//

var EPUBJS = EPUBJS || {};
EPUBJS.core = {};

var ELEMENT_NODE = 1;
var TEXT_NODE = 3;
var COMMENT_NODE = 8;
var DOCUMENT_NODE = 9;

//-- Get a element for an id
EPUBJS.core.getEl = function(elem) {
	return document.getElementById(elem);
};

//-- Get all elements for a class
EPUBJS.core.getEls = function(classes) {
	return document.getElementsByClassName(classes);
};

EPUBJS.core.request = function(url, type, withCredentials) {
	var supportsURL = window.URL;
	var BLOB_RESPONSE = supportsURL ? "blob" : "arraybuffer";
	var deferred = new RSVP.defer();
	var xhr = new XMLHttpRequest();
	var uri;

	//-- Check from PDF.js:
	//   https://github.com/mozilla/pdf.js/blob/master/web/compatibility.js
	var xhrPrototype = XMLHttpRequest.prototype;

	var handler = function() {
		var r;

		if (this.readyState != this.DONE) return;

		if ((this.status === 200 || this.status === 0) && this.response) { // Android & Firefox reporting 0 for local & blob urls
			if (type == 'xml'){
                // If this.responseXML wasn't set, try to parse using a DOMParser from text
                if(!this.responseXML) {
                    r = new DOMParser().parseFromString(this.response, "application/xml");
                } else {
                    r = this.responseXML;
                }
			} else if (type == 'xhtml') {
                if (!this.responseXML){
                    r = new DOMParser().parseFromString(this.response, "application/xhtml+xml");
                } else {
                    r = this.responseXML;
                }
			} else if (type == 'html') {
				if (!this.responseXML){
                    r = new DOMParser().parseFromString(this.response, "text/html");
                } else {
                    r = this.responseXML;
                }
			} else if (type == 'json') {
				r = JSON.parse(this.response);
			} else if (type == 'blob') {
				if (supportsURL) {
					r = this.response;
				} else {
					//-- Safari doesn't support responseType blob, so create a blob from arraybuffer
					r = new Blob([this.response]);
				}
			} else {
				r = this.response;
			}

			deferred.resolve(r);
		} else {
			deferred.reject({
				message : this.response,
				stack : new Error().stack
			});
		}
	};

	if (!('overrideMimeType' in xhrPrototype)) {
		// IE10 might have response, but not overrideMimeType
		Object.defineProperty(xhrPrototype, 'overrideMimeType', {
			value: function xmlHttpRequestOverrideMimeType(mimeType) {}
		});
	}

	xhr.onreadystatechange = handler;
	xhr.open("GET", url, true);

	if(withCredentials) {
		xhr.withCredentials = true;
	}

	// If type isn't set, determine it from the file extension
	if(!type) {
		uri = EPUBJS.core.uri(url);
		type = uri.extension;
		type = {
			'htm': 'html'
		}[type] || type;
	}

	if(type == 'blob'){
		xhr.responseType = BLOB_RESPONSE;
	}

	if(type == "json") {
		xhr.setRequestHeader("Accept", "application/json");
	}

	if(type == 'xml') {
		xhr.responseType = "document";
		xhr.overrideMimeType('text/xml'); // for OPF parsing
	}

	if(type == 'xhtml') {
		xhr.responseType = "document";
	}

	if(type == 'html') {
		xhr.responseType = "document";
 	}

	if(type == "binary") {
		xhr.responseType = "arraybuffer";
	}

	xhr.send();

	return deferred.promise;
};

EPUBJS.core.toArray = function(obj) {
	var arr = [];

	for (var member in obj) {
		var newitm;
		if ( obj.hasOwnProperty(member) ) {
			newitm = obj[member];
			newitm.ident = member;
			arr.push(newitm);
		}
	}

	return arr;
};

//-- Parse the different parts of a url, returning a object
EPUBJS.core.uri = function(url){
	var uri = {
				protocol : '',
				host : '',
				path : '',
				origin : '',
				directory : '',
				base : '',
				filename : '',
				extension : '',
				fragment : '',
				href : url
			},
			blob = url.indexOf('blob:'),
			doubleSlash = url.indexOf('://'),
			search = url.indexOf('?'),
			fragment = url.indexOf("#"),
			withoutProtocol,
			dot,
			firstSlash;

	if(blob === 0) {
		uri.protocol = "blob";
		uri.base = url.indexOf(0, fragment);
		return uri;
	}

	if(fragment != -1) {
		uri.fragment = url.slice(fragment + 1);
		url = url.slice(0, fragment);
	}

	if(search != -1) {
		uri.search = url.slice(search + 1);
		url = url.slice(0, search);
		href = uri.href;
	}

	if(doubleSlash != -1) {
		uri.protocol = url.slice(0, doubleSlash);
		withoutProtocol = url.slice(doubleSlash+3);
		firstSlash = withoutProtocol.indexOf('/');

		if(firstSlash === -1) {
			uri.host = uri.path;
			uri.path = "";
		} else {
			uri.host = withoutProtocol.slice(0, firstSlash);
			uri.path = withoutProtocol.slice(firstSlash);
		}


		uri.origin = uri.protocol + "://" + uri.host;

		uri.directory = EPUBJS.core.folder(uri.path);

		uri.base = uri.origin + uri.directory;
		// return origin;
	} else {
		uri.path = url;
		uri.directory = EPUBJS.core.folder(url);
		uri.base = uri.directory;
	}

	//-- Filename
	uri.filename = url.replace(uri.base, '');
	dot = uri.filename.lastIndexOf('.');
	if(dot != -1) {
		uri.extension = uri.filename.slice(dot+1);
	}
	return uri;
};

//-- Parse out the folder, will return everything before the last slash

EPUBJS.core.folder = function(url){

	var lastSlash = url.lastIndexOf('/');

	if(lastSlash == -1) var folder = '';

	folder = url.slice(0, lastSlash + 1);

	return folder;

};

//-- https://github.com/ebidel/filer.js/blob/master/src/filer.js#L128
EPUBJS.core.dataURLToBlob = function(dataURL) {
	var BASE64_MARKER = ';base64,',
		parts, contentType, raw, rawLength, uInt8Array;

	if (dataURL.indexOf(BASE64_MARKER) == -1) {
		parts = dataURL.split(',');
		contentType = parts[0].split(':')[1];
		raw = parts[1];

		return new Blob([raw], {type: contentType});
	}

	parts = dataURL.split(BASE64_MARKER);
	contentType = parts[0].split(':')[1];
	raw = window.atob(parts[1]);
	rawLength = raw.length;

	uInt8Array = new Uint8Array(rawLength);

	for (var i = 0; i < rawLength; ++i) {
		uInt8Array[i] = raw.charCodeAt(i);
	}

	return new Blob([uInt8Array], {type: contentType});
};

//-- Load scripts async: http://stackoverflow.com/questions/7718935/load-scripts-asynchronously
EPUBJS.core.addScript = function(src, callback, target) {
	var s, r;
	r = false;
	s = document.createElement('script');
	s.type = 'text/javascript';
	s.async = false;
	s.src = src;
	s.onload = s.onreadystatechange = function() {
		if ( !r && (!this.readyState || this.readyState == 'complete') ) {
			r = true;
			if(callback) callback();
		}
	};
	target = target || document.body;
	target.appendChild(s);
};

EPUBJS.core.addScripts = function(srcArr, callback, target) {
	var total = srcArr.length,
		curr = 0,
		cb = function(){
			curr++;
			if(total == curr){
				if(callback) callback();
			}else{
				EPUBJS.core.addScript(srcArr[curr], cb, target);
			}
		};

	EPUBJS.core.addScript(srcArr[curr], cb, target);
};

EPUBJS.core.addCss = function(src, callback, target) {
	var s, r;
	r = false;
	s = document.createElement('link');
	s.type = 'text/css';
	s.rel = "stylesheet";
	s.href = src;
	s.onload = s.onreadystatechange = function() {
		if ( !r && (!this.readyState || this.readyState == 'complete') ) {
			r = true;
			if(callback) callback();
		}
	};
	target = target || document.body;
	target.appendChild(s);
};

EPUBJS.core.prefixed = function(unprefixed) {
	var vendors = ["Webkit", "Moz", "O", "ms" ],
		prefixes = ['-Webkit-', '-moz-', '-o-', '-ms-'],
		upper = unprefixed[0].toUpperCase() + unprefixed.slice(1),
		length = vendors.length;

	if (typeof(document.documentElement.style[unprefixed]) != 'undefined') {
		return unprefixed;
	}

	for ( var i=0; i < length; i++ ) {
		if (typeof(document.documentElement.style[vendors[i] + upper]) != 'undefined') {
			return vendors[i] + upper;
		}
	}

	return unprefixed;
};

EPUBJS.core.resolveUrl = function(base, path) {
	var url,
		segments = [],
		uri = EPUBJS.core.uri(path),
		folders = base.split("/"),
		paths;

	if(uri.host) {
		return path;
	}

	folders.pop();

	paths = path.split("/");
	paths.forEach(function(p){
		if(p === ".."){
			folders.pop();
		}else{
			segments.push(p);
		}
	});

	url = folders.concat(segments);

	return url.join("/");
};

// http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript
EPUBJS.core.uuid = function() {
	var d = new Date().getTime();
	var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
			var r = (d + Math.random()*16)%16 | 0;
			d = Math.floor(d/16);
			return (c=='x' ? r : (r&0x7|0x8)).toString(16);
	});
	return uuid;
};

// Fast quicksort insert for sorted array -- based on:
// http://stackoverflow.com/questions/1344500/efficient-way-to-insert-a-number-into-a-sorted-array-of-numbers
EPUBJS.core.insert = function(item, array, compareFunction) {
	var location = EPUBJS.core.locationOf(item, array, compareFunction);
	array.splice(location, 0, item);

	return location;
};

EPUBJS.core.locationOf = function(item, array, compareFunction, _start, _end) {
	var start = _start || 0;
	var end = _end || array.length;
	var pivot = parseInt(start + (end - start) / 2);
	var compared;
	if(!compareFunction){
		compareFunction = function(a, b) {
			if(a > b) return 1;
			if(a < b) return -1;
			if(a = b) return 0;
		};
	}
	if(end-start <= 0) {
		return pivot;
	}

	compared = compareFunction(array[pivot], item);
	if(end-start === 1) {
		return compared > 0 ? pivot : pivot + 1;
	}

	if(compared === 0) {
		return pivot;
	}
	if(compared === -1) {
		return EPUBJS.core.locationOf(item, array, compareFunction, pivot, end);
	} else{
		return EPUBJS.core.locationOf(item, array, compareFunction, start, pivot);
	}
};

EPUBJS.core.indexOfSorted = function(item, array, compareFunction, _start, _end) {
	var start = _start || 0;
	var end = _end || array.length;
	var pivot = parseInt(start + (end - start) / 2);
	var compared;
	if(!compareFunction){
		compareFunction = function(a, b) {
			if(a > b) return 1;
			if(a < b) return -1;
			if(a = b) return 0;
		};
	}
	if(end-start <= 0) {
		return -1; // Not found
	}

	compared = compareFunction(array[pivot], item);
	if(end-start === 1) {
		return compared === 0 ? pivot : -1;
	}
	if(compared === 0) {
		return pivot; // Found
	}
	if(compared === -1) {
		return EPUBJS.core.indexOfSorted(item, array, compareFunction, pivot, end);
	} else{
		return EPUBJS.core.indexOfSorted(item, array, compareFunction, start, pivot);
	}
};


EPUBJS.core.queue = function(_scope){
	var _q = [];
	var scope = _scope;
	// Add an item to the queue
	var enqueue = function(funcName, args, context) {
		_q.push({
			"funcName" : funcName,
			"args"     : args,
			"context"  : context
		});
		return _q;
	};
	// Run one item
	var dequeue = function(){
		var inwait;
		if(_q.length) {
			inwait = _q.shift();
			// Defer to any current tasks
			// setTimeout(function(){
			scope[inwait.funcName].apply(inwait.context || scope, inwait.args);
			// }, 0);
		}
	};

	// Run All
	var flush = function(){
		while(_q.length) {
			dequeue();
		}
	};
	// Clear all items in wait
	var clear = function(){
		_q = [];
	};

	var length = function(){
		return _q.length;
	};

	return {
		"enqueue" : enqueue,
		"dequeue" : dequeue,
		"flush" : flush,
		"clear" : clear,
		"length" : length
	};
};

// From: https://code.google.com/p/fbug/source/browse/branches/firebug1.10/content/firebug/lib/xpath.js
/**
 * Gets an XPath for an element which describes its hierarchical location.
 */
EPUBJS.core.getElementXPath = function(element) {
	if (element && element.id) {
		return '//*[@id="' + element.id + '"]';
	} else {
		return EPUBJS.core.getElementTreeXPath(element);
	}
};

EPUBJS.core.getElementTreeXPath = function(element) {
	var paths = [];
	var 	isXhtml = (element.ownerDocument.documentElement.getAttribute('xmlns') === "http://www.w3.org/1999/xhtml");
	var index, nodeName, tagName, pathIndex;

	if(element.nodeType === Node.TEXT_NODE){
		// index = Array.prototype.indexOf.call(element.parentNode.childNodes, element) + 1;
		index = EPUBJS.core.indexOfTextNode(element) + 1;

		paths.push("text()["+index+"]");
		element = element.parentNode;
	}

	// Use nodeName (instead of localName) so namespace prefix is included (if any).
	for (; element && element.nodeType == 1; element = element.parentNode)
	{
		index = 0;
		for (var sibling = element.previousSibling; sibling; sibling = sibling.previousSibling)
		{
			// Ignore document type declaration.
			if (sibling.nodeType == Node.DOCUMENT_TYPE_NODE) {
				continue;
			}
			if (sibling.nodeName == element.nodeName) {
				++index;
			}
		}
		nodeName = element.nodeName.toLowerCase();
		tagName = (isXhtml ? "xhtml:" + nodeName : nodeName);
		pathIndex = (index ? "[" + (index+1) + "]" : "");
		paths.splice(0, 0, tagName + pathIndex);
	}

	return paths.length ? "./" + paths.join("/") : null;
};

EPUBJS.core.nsResolver = function(prefix) {
	var ns = {
		'xhtml' : 'http://www.w3.org/1999/xhtml',
		'epub': 'http://www.idpf.org/2007/ops'
	};
	return ns[prefix] || null;
};

//https://stackoverflow.com/questions/13482352/xquery-looking-for-text-with-single-quote/13483496#13483496
EPUBJS.core.cleanStringForXpath = function(str)  {
		var parts = str.match(/[^'"]+|['"]/g);
		parts = parts.map(function(part){
				if (part === "'")  {
						return '\"\'\"'; // output "'"
				}

				if (part === '"') {
						return "\'\"\'"; // output '"'
				}
				return "\'" + part + "\'";
		});
		return "concat(\'\'," + parts.join(",") + ")";
};

EPUBJS.core.indexOfTextNode = function(textNode){
	var parent = textNode.parentNode;
	var children = parent.childNodes;
	var sib;
	var index = -1;
	for (var i = 0; i < children.length; i++) {
		sib = children[i];
		if(sib.nodeType === Node.TEXT_NODE){
			index++;
		}
		if(sib == textNode) break;
	}

	return index;
};

// Underscore
EPUBJS.core.defaults = function(obj) {
  for (var i = 1, length = arguments.length; i < length; i++) {
    var source = arguments[i];
    for (var prop in source) {
      if (obj[prop] === void 0) obj[prop] = source[prop];
    }
  }
  return obj;
};

EPUBJS.core.extend = function(target) {
    var sources = [].slice.call(arguments, 1);
    sources.forEach(function (source) {
      if(!source) return;
      Object.getOwnPropertyNames(source).forEach(function(propName) {
        Object.defineProperty(target, propName, Object.getOwnPropertyDescriptor(source, propName));
      });
    });
    return target;
};

EPUBJS.core.clone = function(obj) {
  return EPUBJS.core.isArray(obj) ? obj.slice() : EPUBJS.core.extend({}, obj);
};

EPUBJS.core.isElement = function(obj) {
    return !!(obj && obj.nodeType == 1);
};

EPUBJS.core.isNumber = function(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
};

EPUBJS.core.isString = function(str) {
  return (typeof str === 'string' || str instanceof String);
};

EPUBJS.core.isArray = Array.isArray || function(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]';
};

// Lodash
EPUBJS.core.values = function(object) {
	var index = -1;
	var props, length, result;

	if(!object) return [];

  props = Object.keys(object);
  length = props.length;
  result = Array(length);

  while (++index < length) {
    result[index] = object[props[index]];
  }
  return result;
};

EPUBJS.core.indexOfNode = function(node, typeId) {
	var parent = node.parentNode;
	var children = parent.childNodes;
	var sib;
	var index = -1;
	for (var i = 0; i < children.length; i++) {
		sib = children[i];
		if (sib.nodeType === typeId) {
			index++;
		}
		if (sib == node) break;
	}

	return index;
}

EPUBJS.core.indexOfTextNode = function(textNode) {
	return EPUBJS.core.indexOfNode(textNode, TEXT_NODE);
}

EPUBJS.core.indexOfElementNode = function(elementNode) {
	return EPUBJS.core.indexOfNode(elementNode, ELEMENT_NODE);
}

var EPUBJS = EPUBJS || {};
EPUBJS.reader = {};
EPUBJS.reader.plugins = {}; //-- Attach extra Controllers as plugins (like search?)

(function(root, $) {

	var previousReader = root.ePubReader || {};

	var ePubReader = root.ePubReader = function(path, options) {
		return new EPUBJS.Reader(path, options);
	};

	//exports to multiple environments
	if (typeof define === 'function' && define.amd) {
		//AMD
		define(function(){ return Reader; });
	} else if (typeof module != "undefined" && module.exports) {
		//Node
		module.exports = ePubReader;
	}

})(window, jQuery);

EPUBJS.Reader = function(bookPath, _options) {
	var reader = this;
	var book;

function _percentToScale(pct) {
  if (!pct) return 1;
  var n = parseFloat(String(pct).replace('%', ''));
  if (!isFinite(n) || n <= 0) return 1;
  return n / 100;
}

function _applyUiScale(fontSizePct) {
  var scale = _percentToScale(fontSizePct);
  document.documentElement.style.setProperty('--ui-font-scale', String(scale));
}
function primeThemeForContents(contents, themeName) {
  try {
    if (!contents) return;
    var doc = contents.document || contents.doc || null;
    if (!doc || !doc.documentElement || !doc.body) return;
    var isDark = themeName === "dark";
    var bg = isDark ? "#000000" : "#FCFAF8";
    var fg = isDark ? "#ffffff" : "#000000";
    try {
      if (contents.addStylesheetRules) {
        contents.addStylesheetRules({
          "html, body": {
            "background": bg,
            "color": fg
          }
        });
      }
    } catch (e0) {}
    try { doc.documentElement.style.setProperty("background-color", bg, "important"); } catch (e1) {}
    try { doc.body.style.setProperty("background-color", bg, "important"); } catch (e2) {}
    try { doc.documentElement.style.setProperty("color", fg, "important"); } catch (e3) {}
    try { doc.body.style.setProperty("color", fg, "important"); } catch (e4) {}
    try {
      var fe = (doc.defaultView && doc.defaultView.frameElement) ? doc.defaultView.frameElement : null;
      if (fe && fe.style) fe.style.setProperty("background-color", bg, "important");
    } catch (e5) {}
  } catch (e6) {}
}
function applyThemeToDoc(doc, themeName) {
  try {
    if (!doc || !doc.documentElement || !doc.body) return;
    var isDark = themeName === "dark";
    var bg = isDark ? "#000000" : "#FCFAF8";
    var fg = isDark ? "#ffffff" : "#000000";
    try { doc.documentElement.style.setProperty("background-color", bg, "important"); } catch (e1) {}
    try { doc.body.style.setProperty("background-color", bg, "important"); } catch (e2) {}
    try { doc.documentElement.style.setProperty("color", fg, "important"); } catch (e3) {}
    try { doc.body.style.setProperty("color", fg, "important"); } catch (e4) {}
  } catch (e5) {}
}
function applyThemeToIframes(themeName) {
  try {
    var list = document.querySelectorAll("#viewerStack iframe, #viewer iframe, #viewer-prev iframe, #viewer-next iframe");
    for (var i = 0; i < list.length; i++) {
      var ifr = list[i];
      if (ifr && ifr.contentDocument) applyThemeToDoc(ifr.contentDocument, themeName);
    }
  } catch (e) {}
}
	var plugin;
	var $viewer = $("#viewer");
	var search = window.location.search;
	var parameters;

	this.settings = EPUBJS.core.defaults(_options || {}, {
		bookPath : bookPath,
		restore : true,
		reload : false,
		bookmarks : undefined,
		annotations : undefined,
		contained : undefined,
		bookKey : undefined,
		styles : undefined,
		generatePagination: false,
		history: true
	});

	// Overide options with search parameters
	if(search) {
		parameters = search.slice(1).split("&");
		parameters.forEach(function(p){
			var split = p.split("=");
			var name = split[0];
			var value = split[1] || '';
			reader.settings[name] = decodeURIComponent(value);
		});
	}

	this.setBookKey(this.settings.bookPath); //-- This could be username + path or any unique string

	if(this.settings.restore && this.isSaved()) {
		this.applySavedSettings();
	}

	this.settings.styles = this.settings.styles || {
		fontSize : "100%"
	};

		// Default font size:
		//  - phone: +20%
		//  - desktop: +10%
		try {
			var ua = (navigator && navigator.userAgent) ? navigator.userAgent : "";
			var isMobileUA = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
			var vw = (window.visualViewport && window.visualViewport.width) ? window.visualViewport.width : window.innerWidth;
			var isMobileViewport = !!vw && vw <= 1024;
			if (!this.settings.styles.fontSize || this.settings.styles.fontSize === "100%") {
				// Mobile text should match the (larger) TOC scale.
				this.settings.styles.fontSize = (isMobileUA || isMobileViewport) ? "124%" : "110%";
			}
		} catch (e) {}

		_applyUiScale(this.settings.styles.fontSize);

	this.book = book = new ePub(this.settings.bookPath, this.settings);

	this.offline = false;
	if(!this.settings.bookmarks) {
		this.settings.bookmarks = [];
	}
	if(!this.settings.notes) {
		this.settings.notes = [];
	}

	if(!this.settings.annotations) {
		this.settings.annotations = [];
	}

	if(this.settings.generatePagination) {
		book.generatePagination($viewer.width(), $viewer.height());
	}

	// Desktop: allow spreads (two-page view) when width permits.
	// Mobile: force single-page to avoid asymmetrical gutters.
	var isMobileView = (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) || window.innerWidth <= 768;
	var readerNewCompatMetrics = applyReaderNewCompatGapMetrics();

	// MAIN rendition (current page) renders into #viewer (kept for backwards compatibility)
	this.rendition = book.renderTo("viewer", {
		ignoreClass: "annotator-hl",
		width: "100%",
		height: "100%",
		spread: isMobileView ? "none" : "auto",
		flow: "paginated",
		gap: readerNewCompatMetrics.enabled ? readerNewCompatMetrics.gap : undefined
	});

	// Neighbor renditions for swipe preview (prev/next pages underneath current)
	// They are rendered into #viewer-prev and #viewer-next, kept in DOM at all times.
	// We do NOT attach UI interactions to them; they are purely visual.
	this.renditionPrev = book.renderTo("viewer-prev", {
		ignoreClass: "annotator-hl",
		width: "100%",
		height: "100%",
		spread: isMobileView ? "none" : "auto",
		flow: "paginated",
		gap: readerNewCompatMetrics.enabled ? readerNewCompatMetrics.gap : undefined
	});
	this.renditionNext = book.renderTo("viewer-next", {
		ignoreClass: "annotator-hl",
		width: "100%",
		height: "100%",
		spread: isMobileView ? "none" : "auto",
		flow: "paginated",
		gap: readerNewCompatMetrics.enabled ? readerNewCompatMetrics.gap : undefined
	});

	// Ensure swipe/tap handlers are attached for ALL renditions (current + neighbor views),
	// so center-tap works on every page even after navigation and pre-render swaps.
	try { this.renditionPrev.hooks.content.register(function(contents){ primeThemeForContents(contents, reader.currentTheme || "light"); }); } catch(e) {}
	try { this.renditionNext.hooks.content.register(function(contents){ primeThemeForContents(contents, reader.currentTheme || "light"); }); } catch(e) {}
	try { this.renditionPrev.hooks.content.register(attachToDoc); } catch(e) {}
	try { this.renditionNext.hooks.content.register(attachToDoc); } catch(e) {}
	try {
		this.renditionPrev.on("rendered", function(section, view){
			try {
				var d1 = (view && view.document) || (view && view.contents && view.contents.document) || null;
				attachSwipeToDoc(d1);
				applyThemeToDoc(d1, reader.currentTheme || "light");
			} catch(e) {}
		});
	} catch(e) {}
	try {
		this.renditionNext.on("rendered", function(section, view){
			try {
				var d2 = (view && view.document) || (view && view.contents && view.contents.document) || null;
				attachSwipeToDoc(d2);
				applyThemeToDoc(d2, reader.currentTheme || "light");
			} catch(e) {}
		});
	} catch(e) {}


	// --- Neighbor swipe preview readiness tracking ---
	// We must guarantee that BOTH neighbor renditions have actually rendered
	// before the user starts the first swipe, otherwise the underlay is blank.
	this._neighborPrevToken = 0;
	this._neighborNextToken = 0;
	this._neighborPrevExpected = 0;
	this._neighborNextExpected = 0;
	this._neighborPrevReady = false;
	this._neighborNextReady = false;
	this._neighborBaseKeyExpected = "";
	this._neighborPrevReadyKey = "";
	this._neighborNextReadyKey = "";
	this._neighborWaiters = [];
	this._neighborPrevTurnWaiters = [];
	this._neighborNextTurnWaiters = [];
	this.__neighborBaseKeyForLocation = function(location){
		try {
			if (location && location.start && location.start.cfi) return String(location.start.cfi);
		} catch(e0){}
		try {
			var loc = this._lastRelocated || (this.rendition && this.rendition.currentLocation ? this.rendition.currentLocation() : null);
			if (loc && loc.start && loc.start.cfi) return String(loc.start.cfi);
		} catch(e1){}
		return "";
	};
	this.__neighborsReadyForLocation = function(location){
		try {
			var baseKey = this.__neighborBaseKeyForLocation(location);
			if (!baseKey) return false;
			return !!(
				this._neighborPrevReady &&
				this._neighborNextReady &&
				this._neighborPrevReadyKey === baseKey &&
				this._neighborNextReadyKey === baseKey
			);
		} catch(e0){}
		return false;
	};
	this.__neighborReadyForTurn = function(location, isNext){
		try {
			var baseKey = this.__neighborBaseKeyForLocation(location);
			if (!baseKey) return false;
			if (isNext) {
				return !!(this._neighborNextReady && this._neighborNextReadyKey === baseKey);
			}
			return !!(this._neighborPrevReady && this._neighborPrevReadyKey === baseKey);
		} catch(e0){}
		return false;
	};
	this.__notifyNeighborTurnWaiters = function(side){
		try {
			var waiters = side === "next" ? this._neighborNextTurnWaiters : this._neighborPrevTurnWaiters;
			if (!waiters || !waiters.length) return;
			var nextWaiters = [];
			for (var i = 0; i < waiters.length; i++) {
				var item = waiters[i];
				try {
					if (this.__neighborReadyForTurn(item.location, side === "next")) {
						try { item.resolve(); } catch (eResolve) {}
					} else {
						nextWaiters.push(item);
					}
				} catch (eItem) {
					nextWaiters.push(item);
				}
			}
			if (side === "next") this._neighborNextTurnWaiters = nextWaiters;
			else this._neighborPrevTurnWaiters = nextWaiters;
		} catch (e) {}
	};
	this.__notifyNeighborWaiters = function(){
		try {
			if (!this._neighborWaiters || !this._neighborWaiters.length) return;
			if (this.__neighborsReadyForLocation(this._lastRelocated)) {
				var w = this._neighborWaiters.slice();
				this._neighborWaiters.length = 0;
				w.forEach(function(fn){ try { fn(); } catch(e){} });
			}
		} catch(e){}
		try { this.__notifyNeighborTurnWaiters("prev"); } catch (ePrev) {}
		try { this.__notifyNeighborTurnWaiters("next"); } catch (eNext) {}
	};
	this.__ensureNeighborsRendered = function(timeoutMs){
		var self = this;
		return new Promise(function(resolve){
			try {
				if (self.__neighborsReadyForLocation(self._lastRelocated)) return resolve();
				self._neighborWaiters.push(resolve);
				setTimeout(function(){
					// fail-open: never block swipe forever
					try { resolve(); } catch(e){}
				}, timeoutMs || 450);
			} catch(e) { resolve(); }
		});
	};
	this.__ensureNeighborRenderedForTurn = function(location, isNext, timeoutMs){
		var self = this;
		return new Promise(function(resolve){
			try {
				if (self.__neighborReadyForTurn(location, !!isNext)) return resolve();
				var side = isNext ? "next" : "prev";
				var list = isNext ? self._neighborNextTurnWaiters : self._neighborPrevTurnWaiters;
				list.push({ location: location, resolve: resolve });
				setTimeout(function(){
					try { resolve(); } catch (eTimeout) {}
				}, timeoutMs || 450);
			} catch (e) { resolve(); }
		});
	};
	this.__markNeighborReady = function(side, token, baseKey){
		try {
			var key = baseKey || "";
			if (side === "prev") {
				if (this._neighborPrevExpected !== token) return;
				this._neighborPrevReady = true;
				this._neighborPrevReadyKey = key;
			} else if (side === "next") {
				if (this._neighborNextExpected !== token) return;
				this._neighborNextReady = true;
				this._neighborNextReadyKey = key;
			}
			this.__notifyNeighborWaiters();
		} catch(e){}
	};
	try {
		var self = this;
		this.renditionPrev.on("rendered", function(section, view){
			try {
				try { var d=(view && (view.document || (view.contents && view.contents.document))) || null; attachUiTapToDoc(d); } catch(eu) {}
				try {
					var baseKey = self._neighborBaseKeyExpected || "";
					var token = self._neighborPrevExpected || 0;
					var loc = self.renditionPrev && self.renditionPrev.currentLocation ? self.renditionPrev.currentLocation() : null;
					var locKey = loc && loc.start && loc.start.cfi ? String(loc.start.cfi) : "";
					if (baseKey && token && locKey && locKey !== baseKey) {
						self.__markNeighborReady("prev", token, baseKey);
					}
				} catch (ePrevRenderedReady) {}
			} catch(e){}
		});
		this.renditionNext.on("rendered", function(section, view){
			try {
				try { var d=(view && (view.document || (view.contents && view.contents.document))) || null; attachUiTapToDoc(d); } catch(eu) {}
				try {
					var baseKey = self._neighborBaseKeyExpected || "";
					var token = self._neighborNextExpected || 0;
					var loc = self.renditionNext && self.renditionNext.currentLocation ? self.renditionNext.currentLocation() : null;
					var locKey = loc && loc.start && loc.start.cfi ? String(loc.start.cfi) : "";
					if (baseKey && token && locKey && locKey !== baseKey) {
						self.__markNeighborReady("next", token, baseKey);
					}
				} catch (eNextRenderedReady) {}
			} catch(e){}
		});
		this.renditionPrev.on("relocated", function(location){
			try {
				var baseKey = self._neighborBaseKeyExpected || "";
				var token = self._neighborPrevExpected || 0;
				var locKey = location && location.start && location.start.cfi ? String(location.start.cfi) : "";
				if (!baseKey || !token || !locKey || locKey === baseKey) return;
				self.__markNeighborReady("prev", token, baseKey);
			} catch (ePrevRelocated) {}
		});
		this.renditionNext.on("relocated", function(location){
			try {
				var baseKey = self._neighborBaseKeyExpected || "";
				var token = self._neighborNextExpected || 0;
				var locKey = location && location.start && location.start.cfi ? String(location.start.cfi) : "";
				if (!baseKey || !token || !locKey || locKey === baseKey) return;
				self.__markNeighborReady("next", token, baseKey);
			} catch (eNextRelocated) {}
		});
	} catch(e) {}

	// Keep spread mode in sync on resize.
	(function attachSpreadResizeHandler(reader) {
		var lastIsMobile = isMobileView;
		var resizeTimer = null;
		window.addEventListener("resize", function () {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(function () {
				var nowIsMobile = (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) || window.innerWidth <= 768;
				if (nowIsMobile === lastIsMobile) return;
				lastIsMobile = nowIsMobile;
				if (reader && reader.rendition && typeof reader.rendition.spread === "function") {
					reader.rendition.spread(nowIsMobile ? "none" : "auto");
					try { reader.renditionPrev && reader.renditionPrev.spread && reader.renditionPrev.spread(nowIsMobile ? "none" : "auto"); } catch(e1) {}
					try { reader.renditionNext && reader.renditionNext.spread && reader.renditionNext.spread(nowIsMobile ? "none" : "auto"); } catch(e2) {}
					// Force a resize so epub.js recomputes columns/spreads.
					if (typeof reader.rendition.resize === "function") reader.rendition.resize();
					try { reader.renditionPrev && reader.renditionPrev.resize && reader.renditionPrev.resize(); } catch(e3) {}
					try { reader.renditionNext && reader.renditionNext.resize && reader.renditionNext.resize(); } catch(e4) {}
				}
			}, 150);
		});
	})(this);

	// -----------------------------
	// Theme + Footnote superscripts
	// -----------------------------
	// NOTE: The book content is rendered inside an iframe. To style it (dark theme,
	// justify, footnote superscripts, etc.) we must use rendition.themes.
	var __readerIsIPhone = (function () {
		try { return /iPhone/i.test(navigator.userAgent || ""); } catch (e) {}
		return false;
	})();
	var __readerMediaMaxH = __readerIsIPhone ? "100% !important" : "80vh !important";
	var __readerImgMaxH = __readerIsIPhone ? "100% !important" : "90vh !important";
	var lightThemeCss = {
		"html, body": {
			"background": "#ffffff",
			"color": "#000000",
			"margin": "0",
			"padding": "0",
			"font-family": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif !important",
			"line-height": "1.5"
		},
		"body": {
			"text-align": "justify",
			"font-family": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif !important"
		},
		"p, div, span, li, ul, ol, td, th, blockquote": {
			"font-family": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif !important"
		},
		"blockquote": {
			"border-left": "none !important",
			"padding-left": "0 !important",
			"margin-left": "0 !important"
		},
		"ol, ul, li": {
			"border-left": "none !important"
		},
		"ol, ul, li": {
			"border-left": "none !important"
		},
		"h1, h2, h3, h4, h5, h6": {
			"break-after": "avoid",
			"page-break-after": "avoid",
			"break-inside": "avoid",
			"page-break-inside": "avoid"
		},
		"img, svg, video, figure, picture": {
			"max-width": "100% !important",
			"width": "100% !important",
			"max-height": __readerMediaMaxH,
			"height": "auto !important",
			"object-fit": "contain",
			"display": "block",
			"margin": "0 auto",
			"break-inside": "avoid",
			"page-break-inside": "avoid"
		},
		"a": {
			"color": "#1a0dab"
		},
		// Footnote markers are usually links (role/doc-noteref or epub:type=noteref)
		// Make them superscript everywhere.
		"a[role~='doc-noteref'], a[epub\\:type~='noteref'], a[epub\\|type~='noteref'], a.noteref, a.footnote-ref, a.fn, a[href*='#fn'], a[href*='footnote']": {
			"vertical-align": "super",
			"font-size": "0.75em",
			"line-height": "1",
			"text-decoration": "none",
			"color": "#ff00ff"
		},
		"sup": {
			"vertical-align": "super"
		},
		"img": {
			"max-width": "100% !important",
			"height": "auto !important",
			"max-height": __readerImgMaxH,
			"object-fit": "contain"
		},
		"svg": {
			"max-width": "100% !important",
			"height": "auto !important",
			"max-height": __readerImgMaxH
		},
		"aside[epub\\:type~='footnote'], aside[epub\\|type~='footnote'], [role~='doc-footnote'], [role~='doc-endnote'], [role~='doc-endnotes'], ol.footnotes, .footnotes, div.footnotes": {
			"display": "none !important"
		},
			".popup, .popup.modal": {
				"background": "#eeeeee !important",
				"color": "#000000 !important",
				"border": "1px solid #cccccc !important"
			},
			".popup .pop_content, .popup .popup-close": {
				"color": "#000000 !important"
			},
};

	var darkThemeCss = {
		"html, body": {
			"background": "#000000",
			"color": "#ffffff",
			"margin": "0",
			"padding": "0",
			"font-family": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif !important",
			"line-height": "1.5"
		},
		"p, div, span, li, ul, ol, td, th, blockquote": {
			"font-family": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif !important"
		},
		"blockquote": {
			"border-left": "none !important",
			"padding-left": "0 !important",
			"margin-left": "0 !important"
		},
		"body": {
			"text-align": "justify"
		},
		"h1, h2, h3, h4, h5, h6": {
			"break-after": "avoid",
			"page-break-after": "avoid",
			"break-inside": "avoid",
			"page-break-inside": "avoid"
		},
		"img, svg, video, figure, picture": {
			"max-width": "100% !important",
			"width": "100% !important",
			"max-height": __readerMediaMaxH,
			"height": "auto !important",
			"object-fit": "contain",
			"display": "block",
			"margin": "0 auto",
			"break-inside": "avoid",
			"page-break-inside": "avoid"
		},
		"a": {
			"color": "#ffffff"
		},
		"a[role~='doc-noteref'], a[epub\\:type~='noteref'], a[epub\\|type~='noteref'], a.noteref, a.footnote-ref, a.fn, a[href*='#fn'], a[href*='footnote']": {
			"vertical-align": "super",
			"font-size": "0.75em",
			"line-height": "1",
			"text-decoration": "none",
			/* Dark theme: magenta footnote markers */
			"color": "#ff00ff"
		},
		"sup": {
			"vertical-align": "super",
			"color": "inherit"
		},
		"body": {
			"margin": "0 !important",
			"padding": "0 0.05rem !important"
		},
		"img": {
			"max-width": "100% !important",
			"height": "auto !important",
			"max-height": __readerImgMaxH,
			"object-fit": "contain"
		},
		"svg": {
			"max-width": "100% !important",
			"height": "auto !important",
			"max-height": __readerImgMaxH
		},
		"ol, ul, li": {
			"border-left": "none !important"
		}
,
		"aside[epub\\:type~='footnote'], aside[epub\\|type~='footnote'], [role~='doc-footnote'], [role~='doc-endnote'], [role~='doc-endnotes'], ol.footnotes, .footnotes, div.footnotes": {
			"display": "none !important"
		},
		".popup, .popup.modal": {
			"background": "#000000 !important",
			"color": "#ffffff !important",
			"border": "1px solid #ffffff !important"
		},
		".popup .pop_content, .popup .popup-close": {
			"color": "#ffffff !important"
		},
};

	// Register themes on all three renditions (current / prev / next)
	this.rendition.themes.register("light", lightThemeCss);
	this.rendition.themes.register("dark", darkThemeCss);
	try { this.renditionPrev.themes.register("light", lightThemeCss); } catch(e1) {}
	try { this.renditionPrev.themes.register("dark", darkThemeCss); } catch(e2) {}
	try { this.renditionNext.themes.register("light", lightThemeCss); } catch(e3) {}
	try { this.renditionNext.themes.register("dark", darkThemeCss); } catch(e4) {}

	// Default theme
	this.currentTheme = "light";
	this.rendition.themes.select("light");
	try { this.renditionPrev.themes.select("light"); } catch(e1) {}
	try { this.renditionNext.themes.select("light"); } catch(e2) {}
	$("body").removeClass("dark-ui");
	applyThemeToIframes("light");

	// -----------------------------
	// Footnote modals (click / tap only)
	// -----------------------------
	// Show footnote text in a centered modal in the TOP document (outside the EPUB iframe).
	// Text is extracted ONLY from the already loaded iframe document (current chapter).
	(function attachFootnoteModals(reader) {
		if (!reader || !reader.rendition) return;

		// Always reference the rendition from the reader instance.
		// Some bundled builds do not expose a global `rendition` variable.
		var rendition = reader.rendition;

		// ===== Main-document modal =====
		var mainModal = null;

			function ensureMainModal() {
				var host = document.getElementById("container") || document.body;
				if (mainModal) {
					try {
						if (host && mainModal.overlay && mainModal.overlay.parentNode !== host) host.appendChild(mainModal.overlay);
				} catch (e0) {}
				return mainModal;
			}

				var overlay = document.createElement("div");
				overlay.id = "fnMainOverlay";
				overlay.className = "selection-translate fn-main-modal hidden";

				var box = document.createElement("div");
				box.id = "fnMainBox";
				box.className = "selection-translate-panel fn-main-panel";

				var close = document.createElement("button");
				close.type = "button";
				close.setAttribute("aria-label", "Close");
				close.className = "selection-translate-close fn-main-close";
				close.textContent = "×";

				var body = document.createElement("div");
				body.id = "fnMainBody";
				body.className = "selection-translate-result fn-main-body";
				var content = document.createElement("div");
				content.className = "fn-main-content";

			close.addEventListener("click", function (ev) {
				ev.preventDefault();
				hideMainModal();
			});

			overlay.addEventListener("click", function (ev) {
				if (ev.target === overlay) hideMainModal();
			});

				body.appendChild(close);
				body.appendChild(content);
				box.appendChild(body);
				overlay.appendChild(box);
			try {
				(host || document.body).appendChild(overlay);
			} catch (e1) {
				document.body.appendChild(overlay);
			}

				mainModal = { overlay: overlay, box: box, body: body, content: content, close: close };
				return mainModal;
			}

			function applyMainModalTheme(themeName) {
				try {
					var m = ensureMainModal();
					m.overlay.setAttribute("data-theme", themeName || "light");
				} catch (eTheme) {}
			}

			function showMainModal(html) {
				var themeName = (reader && reader.currentTheme) ? reader.currentTheme : "light";
				applyMainModalTheme(themeName);
				var m = ensureMainModal();
				m.content.innerHTML = html || "<p>Сноска не найдена.</p>";
				m.overlay.classList.remove("hidden");
			}

		function isIOSDevice() {
			try {
				var ua = navigator.userAgent || "";
				var iOS = /iP(ad|hone|od)/i.test(ua);
				var iPadOS = /Macintosh/i.test(ua) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1;
				return iOS || iPadOS;
			} catch (e) {
				return false;
			}
		}

		function captureIframeScrollState() {
			var list = [];
			try {
				var iframes = document.querySelectorAll("#viewerStack iframe, #viewer iframe, #viewer-prev iframe, #viewer-next iframe");
				for (var i = 0; i < iframes.length; i++) {
					var f = iframes[i];
					if (!f || !f.contentWindow || !f.contentDocument) continue;
					var doc = f.contentDocument;
					var win = f.contentWindow;
					var scroller = doc.scrollingElement || doc.documentElement || doc.body;
					list.push({
						iframe: f,
						win: win,
						scroller: scroller,
						left: scroller ? scroller.scrollLeft : (win.pageXOffset || 0),
						top: scroller ? scroller.scrollTop : (win.pageYOffset || 0)
					});
				}
			} catch (e) {}
			return list;
		}

		function restoreIframeScrollState(list) {
			if (!list || !list.length) return;
			for (var i = 0; i < list.length; i++) {
				var item = list[i];
				try {
					if (item.scroller) {
						item.scroller.scrollLeft = item.left || 0;
						item.scroller.scrollTop = item.top || 0;
					}
				} catch (e0) {}
				try {
					if (item.win && typeof item.win.scrollTo === "function") {
						item.win.scrollTo(item.left || 0, item.top || 0);
					}
				} catch (e1) {}
			}
		}

		function fixIOSViewportAfterFootnote() {
			if (!isIOSDevice()) return;
			try {
				document.documentElement.scrollLeft = 0;
				document.body.scrollLeft = 0;
			} catch (e0) {}
			try {
				window.scrollTo(0, window.scrollY || 0);
			} catch (e1) {}
			try {
				var vs = document.getElementById("viewerStack");
				if (vs) vs.scrollLeft = 0;
				var v = document.getElementById("viewer");
				if (v) v.scrollLeft = 0;
			} catch (e2) {}
			try {
				if (reader && reader.rendition && reader.rendition.resize) reader.rendition.resize();
			} catch (e3) {}
			try {
				if (reader && reader.rendition && reader.rendition.manager && reader.rendition.manager.update) {
					reader.rendition.manager.update();
				}
			} catch (e4) {}
		}

		function getCurrentCfiSafe() {
			try {
				var loc = rendition && rendition.currentLocation ? rendition.currentLocation() : null;
				return loc && loc.start && loc.start.cfi ? loc.start.cfi : null;
			} catch (e) {
				return null;
			}
		}

		var lastFootnoteScrollState = null;
		var lastFootnoteCfi = null;

			function hideMainModal() {
				var m = ensureMainModal();
				m.overlay.classList.add("hidden");
				// iOS: close footnote can leave the iframe horizontally shifted
			// (reset scroll + force a resize to stabilize the layout)
			if (isIOSDevice()) {
				var snap = lastFootnoteScrollState;
				setTimeout(function(){ restoreIframeScrollState(snap); fixIOSViewportAfterFootnote(); }, 0);
				setTimeout(function(){ restoreIframeScrollState(snap); fixIOSViewportAfterFootnote(); }, 120);
				setTimeout(function(){ restoreIframeScrollState(snap); fixIOSViewportAfterFootnote(); }, 240);
				// Final fallback: re-display current location if still shifted
				try {
					if (lastFootnoteCfi && reader && reader.rendition && reader.rendition.display) {
						setTimeout(function(){ reader.rendition.display(lastFootnoteCfi); }, 300);
					}
				} catch (e5) {}
			}
		}

		// Expose for UI theme toggle
		reader.__applyMainFootnoteModalTheme = applyMainModalTheme;

		function sanitizeNoteHtml(html) {
			if (!html) return "";
			return String(html)
				.replace(/<a\b[^>]*>(.*?)<\/a>/gi, "$1")
				.replace(/\s+/g, " ")
				.trim();
		}

		function findTargetByIdOrPrefix(doc, fragmentId) {
			if (!doc || !fragmentId) return null;
			var el = null;
			try { el = doc.getElementById(fragmentId); } catch (e) { el = null; }
			if (el) return el;
			if (!doc.querySelector) return null;

			// name="..." anchors
			try {
				var safe = String(fragmentId).replace(/'/g, "\\'");
				el = doc.querySelector("a[name='" + safe + "']");
				if (el) return el;
			} catch (e2) {}

			// Prefix match: href may be "#fn" while the real id is "fn1".
			try {
				var frag = String(fragmentId);
				if (frag.length >= 2) {
					var esc = frag.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
					el = doc.querySelector("[id^='" + esc + "']") || doc.querySelector("a[name^='" + esc + "']");
					if (el) return el;
				}
			} catch (e3) {}

			return null;
		}

		function getNoteFromSameDoc(doc, fragmentId) {
			if (!doc || !fragmentId) return null;
			var el = findTargetByIdOrPrefix(doc, fragmentId);
			if (!el) return null;
			var candidate = el;

			// If target is an empty anchor, climb to a likely container.
			try {
				var txt = (candidate.textContent || "").replace(/\s+/g, "").trim();
				if (txt.length < 2) {
					var container = candidate.closest ? candidate.closest("li, aside, section, div, p") : null;
					if (container) candidate = container;
					else if (candidate.parentElement) candidate = candidate.parentElement;
				}
			} catch (e) {}

			return sanitizeNoteHtml(candidate.innerHTML || candidate.textContent || "");
		}

		function parseHtmlToDoc(html) {
			try {
				// Prefer XHTML parsing first
				return new DOMParser().parseFromString(html, "application/xhtml+xml");
			} catch (e) {
				return new DOMParser().parseFromString(html, "text/html");
			}
		}

		function normalizePath(path) {
			// Normalize a relative URL path (no scheme/host), resolving '.' and '..'
			var p = String(path || "");
			var parts = p.split("/");
			var out = [];
			for (var i = 0; i < parts.length; i++) {
				var seg = parts[i];
				if (!seg || seg === ".") continue;
				if (seg === "..") { if (out.length) out.pop(); continue; }
				out.push(seg);
			}
			return out.join("/");
		}

		function dirnamePath(path) {
			var p = String(path || "");
			var q = p.indexOf("?");
			if (q !== -1) p = p.substring(0, q);
			var h = p.indexOf("#");
			if (h !== -1) p = p.substring(0, h);
			var idx = p.lastIndexOf("/");
			if (idx === -1) return "";
			return p.substring(0, idx + 1);
		}

		function resolveRelativePath(basePath, relPath) {
			var rel = String(relPath || "");
			if (!rel) return "";
			// If already absolute-ish (starts with / or has a scheme), keep it
			if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rel) || rel.startsWith("/")) return rel;
			var base = dirnamePath(basePath);
			return normalizePath(base + rel);
		}

		function getCurrentSpineHref(currentDoc) {
			// Try multiple epub.js 0.3 APIs to get current chapter href
			try {
				var loc = (rendition && rendition.currentLocation) ? rendition.currentLocation() : null;
				if (loc && loc.start && loc.start.href) return loc.start.href;
			} catch (e) {}
			try {
				var loc2 = rendition && rendition.location ? rendition.location : null;
				if (loc2 && loc2.start && loc2.start.href) return loc2.start.href;
			} catch (e2) {}
			try {
				if (currentDoc && currentDoc.__epubjsSpineHref) return currentDoc.__epubjsSpineHref;
			} catch (e3) {}
			return "";
		}

		function buildAbsoluteBookUrl(internalPath) {
			// internalPath like "EPUB/text/notes-ch005.xhtml"
			// Prefer epub.js canonical resolver (works even when iframe baseURI is about:srcdoc)
			try {
				if (reader && reader.book && typeof reader.book.canonical === 'function') {
					return reader.book.canonical(internalPath);
				}
			} catch (e0) {}
			// Fallback: join against explicit base if provided
			var base = (typeof window !== 'undefined' && window.__EPUBJS_BOOK_BASE) ? window.__EPUBJS_BOOK_BASE : '';
			try {
				if (base) return new URL(internalPath, base).toString();
			} catch (e) {}
			return internalPath;
		}

		function getNoteHtmlFromHref(currentDoc, href) {
			if (!href) return Promise.resolve(null);
			var h = String(href);
			if (h.indexOf("#") === -1) return Promise.resolve(null);
			var parts = h.split("#");
			var pathPart = parts[0] || "";
			var frag = parts[1] || "";
			if (!frag) return Promise.resolve(null);

			// Same-document reference
			if (!pathPart) {
				return Promise.resolve(getNoteFromSameDoc(currentDoc, frag));
			}

			// Cross-document reference (your EPUB uses notes-chXXX.xhtml#fn1)
			var currentHref = getCurrentSpineHref(currentDoc);
			var resolvedInternal = currentHref ? resolveRelativePath(currentHref, pathPart) : normalizePath(pathPart);
			var absUrl = "";
			try {
				if (reader && reader.book && typeof reader.book.canonical === "function") {
					absUrl = reader.book.canonical(resolvedInternal);
				}
			} catch (ec) {}
			if (!absUrl) absUrl = buildAbsoluteBookUrl(resolvedInternal);

			return fetch(absUrl, { credentials: "same-origin" })
				.then(function (r) { return r.text(); })
				.then(function (html) {
					var parsed = parseHtmlToDoc(html);
					var note = getNoteFromSameDoc(parsed, frag);
					if (note) return note;
					// Fallback to HTML parsing if XHTML parser produced an error doc
					try {
						var parsed2 = new DOMParser().parseFromString(html, "text/html");
						return getNoteFromSameDoc(parsed2, frag);
					} catch (e2) {
						return null;
					}
				})
				.catch(function () { return null; });
		}

		function looksLikeFootnoteHref(href) {
			if (!href) return false;
			var h = String(href);
			if (h.indexOf("#") === -1) return false;
			return /#(fn|ftn|_ftn|_fn|fnref|ftnref|_ftnref|_fnref|noteref|note|footnote|endnote)/i.test(h);
		}

		function findAnchorFromEvent(doc, ev) {
			if (!doc || !ev) return null;

			var t = ev.target || null;
			if (t && t.nodeType === 3) t = t.parentElement;

			var a = null;
			try {
				if (t && t.closest) a = t.closest("a");
			} catch (e) {}

			if (a && looksLikeFootnoteHref(a.getAttribute("href"))) return a;

			// Fallback: elementFromPoint
			try {
				var x = (typeof ev.clientX === "number") ? ev.clientX : null;
				var y = (typeof ev.clientY === "number") ? ev.clientY : null;
				if (x !== null && y !== null && doc.elementFromPoint) {
					var el = doc.elementFromPoint(x, y);
					if (el && el.nodeType === 3) el = el.parentElement;
					if (el && el.closest) {
						var aa = el.closest("a");
						if (aa && looksLikeFootnoteHref(aa.getAttribute("href"))) return aa;
					}
				}
			} catch (e2) {}

			return null;
		}

		function onActivate(doc, ev) {
			var a = findAnchorFromEvent(doc, ev);
			if (!a) return;

			try {
				try {
					var w = doc && doc.defaultView ? doc.defaultView : null;
					var topWin = (w && w.parent) ? w.parent : window;
					if (topWin) topWin.__fb_lastFootnoteHit = Date.now();
				} catch (e0) {}
				ev.preventDefault();
				ev.stopPropagation();
				if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
			} catch (e) {}

			if (isIOSDevice()) {
				try { lastFootnoteScrollState = captureIframeScrollState(); } catch (e0) { lastFootnoteScrollState = null; }
				try { lastFootnoteCfi = getCurrentCfiSafe(); } catch (e1) { lastFootnoteCfi = null; }
			}

			var href = a.getAttribute("href") || "";
			showMainModal("<p>Загрузка...</p>");
			getNoteHtmlFromHref(doc, href).then(function (html) {
				showMainModal(html || "<p>Сноска не найдена.</p>");
			});
		}

		function attachToDoc(contentsOrDoc) {
			var doc = null;
			if (!contentsOrDoc) return;

			if (contentsOrDoc.nodeType === 9) doc = contentsOrDoc;
			else doc = contentsOrDoc.document || contentsOrDoc.doc || null;

			try { attachUiTapToDoc(doc); } catch(eu) {}
			try { attachSwipeToDoc(doc); } catch(e) {}
if (!doc) return;
			if (doc.__epubjsFootnoteModalAttached) return;
			doc.__epubjsFootnoteModalAttached = true;

			try {
				doc.__fb_tryFootnoteAtPoint = function (x, y) {
					try {
						var el = null;
						try { el = doc.elementFromPoint(x, y); } catch (e1) { el = null; }
						if (el && el.nodeType === 3) el = el.parentElement;
						var ev = { target: el, clientX: x, clientY: y };
						var a = findAnchorFromEvent(doc, ev);
						if (!a) return false;
						onActivate(doc, {
							target: a,
							clientX: x,
							clientY: y,
							preventDefault: function(){},
							stopPropagation: function(){},
							stopImmediatePropagation: function(){}
						});
						return true;
					} catch (e2) { return false; }
				};
			} catch (e3) {}

				// Do NOT add padding inside the EPUB iframe on mobile.
				// We keep the line width unchanged; instead we shrink the edge tap-zones in the outer UI.

			// Click (desktop)
			doc.addEventListener("click", function (ev) { onActivate(doc, ev); }, true);

			// Tap (mobile)
			doc.addEventListener("touchend", function (ev) {
				try {
					if (ev.changedTouches && ev.changedTouches.length) {
						var t = ev.changedTouches[0];
						ev.clientX = t.clientX;
						ev.clientY = t.clientY;
					}
				} catch (e) {}
				onActivate(doc, ev);
			}, true);

			doc.addEventListener("pointerup", function (ev) { onActivate(doc, ev); }, true);

			// Avoid long-press link menu on footnote refs
			doc.addEventListener("contextmenu", function (ev) {
				var a = findAnchorFromEvent(doc, ev);
				if (!a) return;
				try {
					ev.preventDefault();
					ev.stopPropagation();
					if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
				} catch (e) {}
			}, true);
		}

		
		// ---- Swipe navigation inside the EPUB iframe (mobile) ----
		
		// UI center-tap toggle (independent from swipe)
		// We attach this to EVERY rendered iframe document (current/prev/next),
		// because the visible view can come from any of the 3 prerendered renditions.
			function attachUiTapToDoc(doc) {
				try {
					if (!doc || doc.__uiTapAttached) return;
					doc.__uiTapAttached = true;
					try {
						var compatDesktop = false;
						var compatMetrics = null;
						var compatInsetPx = "0px";
						try { compatDesktop = isReaderNewCompatGapMode() && getCurrentSpreadMode() !== "none"; } catch (eCompatMode) {}
						try {
							compatMetrics = computeReaderNewCompatGapMetrics();
							if (compatMetrics && compatMetrics.enabled && typeof compatMetrics.sideInset === "number") {
								compatInsetPx = Math.max(0, Math.round(compatMetrics.sideInset)) + "px";
							}
						} catch (eCompatMetrics) {}
						if (compatDesktop && doc && doc.head && !doc.getElementById("readerNewCompatDesktopInset")) {
							var compatStyle = doc.createElement("style");
							compatStyle.id = "readerNewCompatDesktopInset";
							compatStyle.textContent =
								"html,body{box-sizing:border-box!important;}" +
								"body{padding-left:0!important;padding-right:0!important;}" +
								"img,svg,video,figure,picture{max-width:100%!important;}";
							doc.head.appendChild(compatStyle);
						}
						if (compatDesktop && doc && doc.body && doc.body.style) {
							try { doc.body.style.setProperty("padding-left", "0px", "important"); } catch (eCompatInsetBodyL) {}
							try { doc.body.style.setProperty("padding-right", "0px", "important"); } catch (eCompatInsetBodyR) {}
						}
					} catch (eCompatInset) {}

					var win = doc.defaultView || window;
					var st = { x: 0, y: 0, ts: 0, moved: false };

					function isMobileUi(topWin) {
						try {
							if (topWin.document && topWin.document.documentElement) {
								var root = topWin.document.documentElement;
								if (root.classList.contains("is-phone") || root.classList.contains("is-tablet")) return true;
							}
							if (topWin.matchMedia && topWin.matchMedia('(pointer: coarse)').matches) return true;
							if (topWin.matchMedia && topWin.matchMedia('(max-width: 768px)').matches) return true;
							if (topWin.navigator && topWin.navigator.maxTouchPoints && topWin.navigator.maxTouchPoints > 0) return true;
							if ("ontouchstart" in topWin) return true;
						} catch (e) {}
						return false;
					}

					function isBlockingSearchUi(topWin) {
						try {
							var body = topWin && topWin.document ? topWin.document.body : null;
							if (!body || !body.classList) return false;
							return body.classList.contains("search-open") && !body.classList.contains("search-minimized");
						} catch (e) {}
						return false;
					}

					function isTabletUi(topWin) {
						try {
							if (topWin.document && topWin.document.documentElement && topWin.document.documentElement.classList.contains("is-tablet")) return true;
						} catch (e0) {}
						try {
							var w = topWin.innerWidth || 0;
							var h = topWin.innerHeight || 0;
							var minDim = Math.min(w, h);
							var coarse = topWin.matchMedia && topWin.matchMedia("(pointer: coarse)").matches;
							return !!(coarse && minDim >= 600);
						} catch (e1) {}
						return false;
					}

					function isTapInCenterZone(localX, localY) {
						var topWin = (win && win.parent) ? win.parent : window;
						var absX = localX;
						var absY = localY;
						try {
							var fr = win && win.frameElement;
							if (fr && fr.getBoundingClientRect) {
								var rr = fr.getBoundingClientRect();
								absX = localX + rr.left;
								absY = localY + rr.top;
							}
						} catch (eFr) {}

						var vw = 0;
						try {
							vw = (topWin.visualViewport && topWin.visualViewport.width) ? topWin.visualViewport.width : (topWin.innerWidth || 0);
						} catch (eVw) {}
						var topBounds = null;
						try { topBounds = topWin.__fbTapCenterBounds; } catch (eB) { topBounds = null; }
							var leftB = topBounds && typeof topBounds.left === "number" ? topBounds.left : (vw * 0.20);
							var rightB = topBounds && typeof topBounds.right === "number" ? topBounds.right : (vw * 0.80);
						var inCenterX = (absX >= leftB && absX <= rightB);
						if (!inCenterX) return false;
						if (!isTabletUi(topWin)) return true;

						var vh = 0;
						try {
							vh = (topWin.visualViewport && topWin.visualViewport.height) ? topWin.visualViewport.height : (topWin.innerHeight || 0);
						} catch (eVh) {}
						return (absY >= vh * (1/3) && absY <= vh * (2/3));
					}

				function isInteractiveTarget(t){
					try {
						if (!t) return false;
						var tag = (t.tagName || "").toLowerCase();
						if (tag === "button" || tag === "input" || tag === "textarea" || tag === "select" || tag === "label") return true;
						var a = null;
						if (tag === "a") a = t;
						else if (t.closest) a = t.closest("a");
						if (a && looksLikeFootnoteHref(a.getAttribute("href"))) return true;
						if (t.closest && t.closest("button,input,textarea,select,label")) return true;
					} catch(e){}
					return false;
				}

				function onStart(ev){
					try {
						if (!ev || !ev.touches || !ev.touches[0]) return;
						var t = ev.touches[0];
						st.x = t.clientX;
						st.y = t.clientY;
						st.ts = Date.now();
						st.moved = false;
						st._interactive = isInteractiveTarget(ev.target);
					} catch(e){}
				}

				function onMove(ev){
					try {
						if (!ev || !ev.touches || !ev.touches[0]) return;
						var t = ev.touches[0];
						// Be forgiving on Android tap jitter
						if (Math.abs(t.clientX - st.x) > 20 || Math.abs(t.clientY - st.y) > 20) st.moved = true;
					} catch(e){}
				}

				function onEnd(ev){
					try {
						if (!ev || st._interactive) return;
						try {
							var __topWinSearch = (win && win.parent) ? win.parent : window;
							if (isBlockingSearchUi(__topWinSearch)) return;
								if (__topWinSearch && __topWinSearch.document && __topWinSearch.document.body && __topWinSearch.document.body.classList.contains("mobile-more-open")) {
									try { if (typeof __topWinSearch.__fb_closeMobileMore === "function") __topWinSearch.__fb_closeMobileMore(); } catch (eCloseMore0) {}
									try { __topWinSearch.__fbSuppressUiTapUntil = Date.now() + 600; } catch (eSupMore0) {}
									try { if (ev.preventDefault) ev.preventDefault(); } catch (eP0) {}
									try { if (ev.stopPropagation) ev.stopPropagation(); } catch (eP1) {}
									try { if (ev.stopImmediatePropagation) ev.stopImmediatePropagation(); } catch (eP2) {}
									return;
								}
						} catch (eSearchOpen0) {}
						if (st.moved) return;

							var changed = (ev.changedTouches && ev.changedTouches[0]) ? ev.changedTouches[0] : null;
							if (!changed) return;

							var x = st.x;
							var y = st.y;
							// Use start coordinates for center detection (more stable than end coords on some devices)
							// fix63: center-tap bar toggle is MOBILE-ONLY
							var __topWin = (win && win.parent) ? win.parent : window;
							if (!isMobileUi(__topWin)) return;
							var inCenter = isTapInCenterZone(x, y);

							var dt = Date.now() - (st.ts || Date.now());
							if (!inCenter || dt > 800) return;

						// Toggle bars on TOP document (bars live there, not in iframe)
							var topWin = (win && win.parent) ? win.parent : window;
							var now = Date.now();
							if ((topWin.__fbSuppressUiTapUntil || 0) > now) return;
							var lastTs = topWin.__fbUiLastToggleTs || 0;
						if ((now - lastTs) < 350) return;
						topWin.__fbUiLastToggleTs = now;

						try {
							if (topWin.document && topWin.document.body) {
								topWin.document.body.classList.toggle("ui-hidden");
							}
						} catch(eToggle){}
						try { topWin.__fbSyncBarHeights && topWin.__fbSyncBarHeights(false); } catch(eSync){}

						// Prevent synthetic click after touchend (Android/iOS)
						if (ev.preventDefault) ev.preventDefault();
						if (ev.stopPropagation) ev.stopPropagation();
						if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
					} catch(e){}
				}

				doc.addEventListener("touchstart", onStart, { passive: true, capture: true });
				doc.addEventListener("touchmove", onMove, { passive: true, capture: true });
				doc.addEventListener("touchend", onEnd, { passive: false, capture: true });

						// Pointer events (some Android/desktop WebViews dispatch pointer instead of touch)
						try {
							doc.addEventListener("pointerdown", function(ev){
								if (!ev) return;
								try {
									var __topWinPtrDown = (win && win.parent) ? win.parent : window;
									if (ev.pointerType === "mouse" && isMobileUi(__topWinPtrDown)) return;
								} catch (ePtrDownMode) {}
								st.x = ev.clientX; st.y = ev.clientY; st.ts = Date.now(); st.moved = false; st._interactive = isInteractiveTarget(ev.target);
							}, { passive: true, capture: true });
							doc.addEventListener("pointermove", function(ev){
								if (!ev) return;
								try {
									var __topWinPtrMove = (win && win.parent) ? win.parent : window;
									if (ev.pointerType === "mouse" && isMobileUi(__topWinPtrMove)) return;
								} catch (ePtrMoveMode) {}
								if (Math.abs(ev.clientX - st.x) > 20 || Math.abs(ev.clientY - st.y) > 20) st.moved = true;
							}, { passive: true, capture: true });
							doc.addEventListener("pointerup", function(ev){
								if (!ev || st._interactive || st.moved) return;
								try {
									var __topWinPtrUp = (win && win.parent) ? win.parent : window;
									if (ev.pointerType === "mouse" && isMobileUi(__topWinPtrUp)) return;
								} catch (ePtrUpMode) {}
								try {
									var __topWinSearchP = (win && win.parent) ? win.parent : window;
									if (isBlockingSearchUi(__topWinSearchP)) return;
										if (__topWinSearchP && __topWinSearchP.document && __topWinSearchP.document.body && __topWinSearchP.document.body.classList.contains("mobile-more-open")) {
											try { if (typeof __topWinSearchP.__fb_closeMobileMore === "function") __topWinSearchP.__fb_closeMobileMore(); } catch (eCloseMore1) {}
											try { __topWinSearchP.__fbSuppressUiTapUntil = Date.now() + 600; } catch (eSupMore1) {}
											try { if (ev.preventDefault) ev.preventDefault(); } catch (eP3) {}
											try { if (ev.stopPropagation) ev.stopPropagation(); } catch (eP4) {}
											try { if (ev.stopImmediatePropagation) ev.stopImmediatePropagation(); } catch (eP5) {}
											return;
										}
								} catch (eSearchOpen1) {}
								var x = st.x;
								var y = st.y;
								// fix63: center-tap bar toggle is MOBILE-ONLY
								var __topWinP = (win && win.parent) ? win.parent : window;
								if (!isMobileUi(__topWinP)) return;
								var inCenter = isTapInCenterZone(x, y);
								var dt = Date.now() - (st.ts || Date.now());
								if (!inCenter || dt > 800) return;
								var topWin = (win && win.parent) ? win.parent : window;
								var now = Date.now();
								var lastTs = topWin.__fbUiLastToggleTs || 0;
								if ((now - lastTs) < 350) return;
								topWin.__fbUiLastToggleTs = now;
								try { topWin.document.body.classList.toggle("ui-hidden"); } catch(e2) {}
								try { topWin.__fbSyncBarHeights && topWin.__fbSyncBarHeights(false); } catch(eSync2) {}
								try { ev.preventDefault && ev.preventDefault(); ev.stopPropagation && ev.stopPropagation(); ev.stopImmediatePropagation && ev.stopImmediatePropagation(); } catch(e3) {}
							}, { passive: false, capture: true });
						} catch(ePtr) {}
			} catch(e){}
		}

function attachSwipeToDoc(doc) {
			try {
				if (!doc || doc.__swipeNavAttached) return;
				doc.__swipeNavAttached = true;
				var win = doc.defaultView || window;
				function isTabletMode() {
					try {
						if (document.documentElement && document.documentElement.classList.contains("is-tablet")) return true;
					} catch (e) {}
					try {
						var ua = navigator.userAgent || "";
						var minS = 0;
						try {
							var sw = (screen && screen.width) ? screen.width : 0;
							var sh = (screen && screen.height) ? screen.height : 0;
							minS = Math.min(sw || 0, sh || 0);
						} catch (e1) {}
						if (!minS) {
							var w = window.innerWidth || 0;
							var h = window.innerHeight || 0;
							minS = Math.min(w, h);
						}
						if (/SM-T/i.test(ua)) return true;
						if (/iPad/i.test(ua)) return true;
						if (/Macintosh/i.test(ua) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1) return minS >= 700;
						if (/Android/i.test(ua) && /Mobile/i.test(ua) && minS >= 600) return true;
						if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return minS >= 600;
						if (/Tablet|PlayBook|Silk|Kindle|Nexus 7|Nexus 9/i.test(ua)) return minS >= 600;
						var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
						return !!(coarse && minS >= 600);
					} catch (e2) {}
						return false;
					}

					function allowEdgeTapTurn() {
						try {
							if (isTabletMode()) return true;
						} catch (e0) {}
						try {
							if (document.documentElement && document.documentElement.classList.contains("is-tablet")) return true;
						} catch (e1) {}
						try {
							var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
							var touch = !!(navigator && navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
							var w = window.innerWidth || 0;
							var h = window.innerHeight || 0;
							var minDim = Math.min(w, h);
							var maxDim = Math.max(w, h);
							// Conservative fallback for tablets that aren't tagged as is-tablet.
							// Keep thresholds high to avoid matching phones.
							return !!(coarse && touch && maxDim >= 900 && minDim >= 560);
						} catch (e2) {}
						return false;
					}

					function isTapInCenterZone(absX, absY) {
						try {
							var rectTap = stack.getBoundingClientRect();
							var wTap = rectTap.width || window.innerWidth || 0;
							var hTap = rectTap.height || window.innerHeight || 0;
							var xRel = absX - rectTap.left;
							var yRel = absY - rectTap.top;
								var inCenterX = (xRel >= wTap * 0.20 && xRel <= wTap * 0.80);
							if (!inCenterX) return false;
							if (!isTabletMode()) return true;
							return (yRel >= hTap * (1/3) && yRel <= hTap * (2/3));
						} catch (eTapZone) {}
						return false;
					}

						function getTabletTapZone(absX, absY) {
							try {
								var rectTap = stack.getBoundingClientRect();
								var wTap = rectTap.width || window.innerWidth || 0;
								var hTap = rectTap.height || window.innerHeight || 0;
							var xRel = absX - rectTap.left;
							var yRel = absY - rectTap.top;
							if (xRel < 0 || xRel > wTap || yRel < 0 || yRel > hTap) return "none";
								var leftCut = wTap * 0.20;
								var rightCut = wTap * 0.80;
								if (xRel >= leftCut && xRel <= rightCut) {
									if (isTabletMode() && !(yRel >= hTap * (1/3) && yRel <= hTap * (2/3))) return "none";
									return "center";
								}
								if (!allowEdgeTapTurn()) return "none";
								return xRel < leftCut ? "left" : "right";
							} catch (eTapZone2) {}
							return "none";
						}

						function isPhoneTouchMode() {
							try {
								if (isTabletMode()) return false;
								var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
								var touch = !!(navigator && navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
								return !!(coarse && touch);
							} catch (ePhoneMode) {}
							return false;
						}

						function getPhoneTapZone(absX, absY) {
							try {
								if (!isPhoneTouchMode()) return "none";
								var rectTap = stack.getBoundingClientRect();
								var wTap = rectTap.width || window.innerWidth || 0;
								var hTap = rectTap.height || window.innerHeight || 0;
								var xRel = absX - rectTap.left;
								var yRel = absY - rectTap.top;
								if (xRel < 0 || xRel > wTap || yRel < 0 || yRel > hTap) return "none";
								var leftCut = wTap * 0.20;
								var rightCut = wTap * 0.80;
								if (xRel >= leftCut && xRel <= rightCut) return "center";
								return xRel < leftCut ? "left" : "right";
							} catch (ePhoneZone) {}
							return "none";
						}

				// Inject swipe CSS into the iframe once (makes padding transparent during swipe only).
				try {
					if (!doc.getElementById("__fb_swipe_css")) {
						var st = doc.createElement("style");
						st.id = "__fb_swipe_css";
						st.textContent =
							"html.fb-swipe-active body{" +
							"background-clip:content-box!important;" +
							"background-color:var(--reader-bg,#ffffff)!important;" +
							"}";
						doc.head && doc.head.appendChild(st);
					}
				} catch(eCss) {}

				// Parent layers (stable; outside the iframe)
				var stack = document.getElementById("viewerStack");
				var layerCurrent = document.getElementById("viewer");
				var shadow = document.getElementById("swipe-shadow");
				if (!stack || !layerCurrent) return;

				// Shared swipe state (per-iframe doc, but uses stable outer layers)
				var state = {
						tracking: false,
						horizontal: false,
						selectionUnlocked: false,
						startedOnInteractive: false,
						startPhoneEdge: false,
						startPhoneZone: "none",
						waitingNeighbors: false,
						pointerActive: false,
						pointerId: null,
						selectionTimer: 0,
					downTs: 0,
					startX: 0,
					startY: 0,
					lastX: 0,
					lastY: 0,
					lastRawDx: 0,
					pendingDx: 0,
					appliedDx: 1e9,
						filteredDx: 0,
						viewW: 0,
						shadowW: 0,
						lastDir: 0,
					lastMoveTs: 0,
					raf: 0,
					lock: false
				};


				function clearSelectionTimer() {
					try {
						if (state.selectionTimer) {
							clearTimeout(state.selectionTimer);
							state.selectionTimer = 0;
						}
					} catch (e) {}
				}

				function lockSwipeSelection() {
					try {
						doc.documentElement.style.userSelect = "none";
						doc.documentElement.style.webkitUserSelect = "none";
						doc.documentElement.style.touchAction = "pan-y";
						if (doc.body) {
							doc.body.style.userSelect = "none";
							doc.body.style.webkitUserSelect = "none";
							doc.body.style.touchAction = "pan-y";
						}
					} catch (e) {}
				}

				function unlockSwipeSelection() {
					try {
						doc.documentElement.style.userSelect = "";
						doc.documentElement.style.webkitUserSelect = "";
						doc.documentElement.style.touchAction = "";
						if (doc.body) {
							doc.body.style.userSelect = "";
							doc.body.style.webkitUserSelect = "";
							doc.body.style.touchAction = "";
						}
					} catch (e) {}
				}

				function armSelectionUnlock() {
					clearSelectionTimer();
					try {
						state.selectionTimer = setTimeout(function(){
							state.selectionTimer = 0;
							if (!state.tracking || state.horizontal || state.startedOnInteractive) return;
							state.selectionUnlocked = true;
							unlockSwipeSelection();
						}, 700);
					} catch (e) {}
				}

				function usesTouchFullBleedLayout() {
					try {
						return !!(window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches);
					} catch (e) {}
					return false;
				}

				function getSwipeOverlayMax() {
					try {
						var css = window.getComputedStyle(document.body || document.documentElement);
						var raw = parseFloat(css.getPropertyValue("--swipe-overlay-max"));
						if (isFinite(raw) && raw >= 0) return raw;
					} catch (e) {}
					return 0.10;
				}

				function setSwipeOverlayAlpha(alpha) {
					try {
						var value = alpha;
						if (!isFinite(value)) value = 0;
						if (value < 0) value = 0;
						document.documentElement.style.setProperty("--swipe-overlay-alpha", value.toFixed(3));
					} catch (e) {}
				}

				function updateSwipeOverlayAlpha(dx) {
					try {
						var w = state.viewW || (stack.getBoundingClientRect().width || window.innerWidth || 0);
						if (!w) {
							setSwipeOverlayAlpha(0);
							return;
						}
						var half = w * 0.5;
						var traveled = Math.abs(dx);
						var fadeProgress = 0;
						if (traveled > half) {
							fadeProgress = Math.min(1, Math.max(0, (traveled - half) / half));
						}
						var alpha = getSwipeOverlayMax() * (1 - fadeProgress);
						setSwipeOverlayAlpha(alpha);
					} catch (e) {
						setSwipeOverlayAlpha(0);
					}
				}

					function syncNeighborTextScale() {
						try {
							if (!reader) return;
							var fs = (reader.settings && reader.settings.styles && reader.settings.styles.fontSize) ? reader.settings.styles.fontSize : null;
							if (!fs) return;
							if (reader.__lastSwipeFontSize !== fs) {
								try { reader.renditionPrev && reader.renditionPrev.themes.fontSize(fs); } catch(e1) {}
								try { reader.renditionNext && reader.renditionNext.themes.fontSize(fs); } catch(e2) {}
								reader.__lastSwipeFontSize = fs;
							}
							// Ensure neighbor views use current layout dimensions (prevents mismatched pagination).
							try { reader.renditionPrev && reader.renditionPrev.resize && reader.renditionPrev.resize(); } catch(e3) {}
							try { reader.renditionNext && reader.renditionNext.resize && reader.renditionNext.resize(); } catch(e4) {}
						} catch (e) {}
					}

					function ensureNeighborsReady() {
						try {
							syncNeighborTextScale();
							// Without a generated Locations map we can't compute prev/next CFIs.
							// So on first swipe we must wait for Locations + neighbor renditions to render.
							var gen = Promise.resolve();
							try {
								var total = reader && reader.book && reader.book.locations ? (reader.book.locations.total || 0) : 0;
								if (!total && reader && typeof reader.__generateLocationsOnce === 'function') {
									gen = reader.__generateLocationsOnce();
								}
							} catch(e0) {}
							return gen.then(function(){
								try {
							if (reader && reader.__updateSwipeNeighbors) {
								var l = reader._lastRelocated || (rendition && rendition.currentLocation && rendition.currentLocation());
								if (l) reader.__updateSwipeNeighbors(l);
							}
						} catch(e1) {}
								var timeoutMs = (reader && reader._swipeWarm) ? 420 : 900;
								var p = (reader && reader.__ensureNeighborsRendered) ? reader.__ensureNeighborsRendered(timeoutMs) : Promise.resolve();
								return p;
							}).finally(function(){
								try { reader._swipeWarm = true; } catch(e2) {}
							});
						} catch (e) {}
						return Promise.resolve();
					}

				function isInteractive(el) {
					try {
						if (!el) return false;
						var tag = (el.tagName || "").toLowerCase();
						if (tag === "button" || tag === "input" || tag === "textarea" || tag === "select" || tag === "label") return true;
						var a = null;
						if (tag === "a") a = el;
						else if (el.closest) a = el.closest("a");
						if (a && looksLikeFootnoteHref(a.getAttribute("href"))) return true;
						return !!(el.closest && el.closest("button,input,textarea,select,label"));
					} catch (e) { return false; }
				}

				function isSelectionActive() {
					try {
						var topWin = (win && win.parent) ? win.parent : window;
						return !!(topWin && topWin.__fbSelectionActive);
					} catch (e) {}
					return false;
				}

				function toAbsXY(x, y) {
					try {
						if (win && win.frameElement && win.frameElement.getBoundingClientRect) {
							var r = win.frameElement.getBoundingClientRect();
							return { x: x + r.left, y: y + r.top, left: r.left, top: r.top };
						}
					} catch (e) {}
					return { x: x, y: y, left: 0, top: 0 };
				}

					function clampDx(dx) {
					try {
							var w = state.viewW || (stack.getBoundingClientRect().width || window.innerWidth || 0);
						if (dx > w) dx = w;
						if (dx < -w) dx = -w;
					} catch (e) {}
					return dx;
				}

					function setShadow(dx) {
					try {
						if (!shadow) return;
							var w = state.viewW || (stack.getBoundingClientRect().width || window.innerWidth || 0);
							var sw = state.shadowW || 6;
						if (dx > 0) {
							// Reveal prev on the left; shadow lives on underlay near the boundary (extend into underlay)
							shadow.style.left = Math.max(0, dx - sw) + "px";
							stack.classList.add("shadow-left");
							stack.classList.remove("shadow-right");
						} else {
							// Reveal next on the right
							shadow.style.left = Math.min(w - sw, (w + dx)) + "px";
							stack.classList.add("shadow-right");
							stack.classList.remove("shadow-left");
						}
					} catch (e) {}
				}

					function setReveal(dx) {
					try {
							stack.classList.add("swiping");
							var dir = (dx > 0) ? 1 : -1;
							if (dir !== state.lastDir) {
								state.lastDir = dir;
								if (dir > 0) {
									stack.classList.add("swipe-reveal-prev");
									stack.classList.remove("swipe-reveal-next");
								} else {
									stack.classList.add("swipe-reveal-next");
									stack.classList.remove("swipe-reveal-prev");
								}
							}
							try { doc.documentElement.classList.add("fb-swipe-active"); } catch(eCss2) {}
							if (!usesTouchFullBleedLayout()) {
								try { document.documentElement.classList.add("fb-swipe-margins"); } catch(eCss3) {}
								try {
									document.documentElement.classList.remove("fb-swipe-underlay-left", "fb-swipe-underlay-right");
									document.documentElement.classList.add(dir > 0 ? "fb-swipe-underlay-left" : "fb-swipe-underlay-right");
								} catch(eCss4) {}
							}
					} catch (e) {}
					updateSwipeOverlayAlpha(dx);
					setShadow(dx);
				}

				function clearReveal() {
					try {
						stack.classList.remove("swiping", "swipe-reveal-prev", "swipe-reveal-next", "shadow-left", "shadow-right", "swipe-undim");
						if (shadow) { shadow.style.left = ""; shadow.style.transition = ""; }
						state.lastDir = 0;
					} catch (e) {}
					setSwipeOverlayAlpha(0);
				}

				function clearRevealOverlayOnly() {
					try {
						stack.classList.remove("shadow-left", "shadow-right");
						stack.classList.add("swipe-undim");
						if (shadow) { shadow.style.left = ""; shadow.style.transition = ""; }
						try { doc.documentElement.classList.remove("fb-swipe-active"); } catch(eCss3) {}
						if (!usesTouchFullBleedLayout()) {
							try { document.documentElement.classList.remove("fb-swipe-margins", "fb-swipe-underlay-left", "fb-swipe-underlay-right"); } catch(eCss4) {}
						}
					} catch (e) {}
					setSwipeOverlayAlpha(0);
				}

				function applyDx(dx) {
					try {
						layerCurrent.style.transition = "none";
						layerCurrent.style.transform = "translate3d(" + dx + "px,0,0)";
					} catch (e) {}
				}

				function canRevealForDx(dx) {
					try {
						if (!dx) return false;
						var isNextTurn = dx < 0;
						var loc = reader && reader._lastRelocated
							? reader._lastRelocated
							: (rendition && rendition.currentLocation && rendition.currentLocation());
						return !!(
							reader &&
							reader.__neighborReadyForTurn &&
							reader.__neighborReadyForTurn(loc, isNextTurn)
						);
					} catch (e) {}
					return false;
				}

				function clearRevealWhileDragging() {
					try {
						stack.classList.add("swiping");
						stack.classList.remove("swipe-reveal-prev", "swipe-reveal-next", "shadow-left", "shadow-right", "swipe-undim");
						if (shadow) { shadow.style.left = ""; shadow.style.transition = ""; }
						try { doc.documentElement.classList.remove("fb-swipe-active"); } catch(eCss3) {}
						if (!usesTouchFullBleedLayout()) {
							try { document.documentElement.classList.remove("fb-swipe-margins", "fb-swipe-underlay-left", "fb-swipe-underlay-right"); } catch(eCss4) {}
						}
					} catch (e) {}
					setSwipeOverlayAlpha(0);
				}

					function scheduleDx(dx) {
							// Smoother + more stable drag: avoid low-pass drift/jitter, but still throttle to RAF.
							var raw = dx;
							if (!isFinite(raw)) return;
							// Pixel-snap early (reduces "double text" shimmering while moving slowly).
							state.pendingDx = Math.round(raw);
							if (state.raf) return;
							state.raf = (win.requestAnimationFrame || function(cb){ return setTimeout(cb, 16); })(function(){
								state.raf = 0;
								var d = clampDx(state.pendingDx);
								d = Math.round(d);
								// Only skip if it would be an identical repaint. Skipping small deltas causes
								// visible "stutter" on slow drags.
								if (d === state.appliedDx) return;
								state.appliedDx = d;
								applyDx(d);
								if (canRevealForDx(d)) {
									setReveal(d);
								} else {
									clearRevealWhileDragging();
								}
							});
						}

				function resetTransform() {
					try {
						layerCurrent.style.willChange = "";
						layerCurrent.style.transition = "";
						layerCurrent.style.transform = "";
						layerCurrent.style.zIndex = "";
						try {
							var vp2 = document.getElementById("viewer-prev");
							var vn2 = document.getElementById("viewer-next");
							if (vp2) vp2.style.zIndex = "";
							if (vn2) vn2.style.zIndex = "";
						} catch (eZ3) {}
						try { doc.documentElement.classList.remove("fb-swipe-active"); } catch(eCss3) {}
						if (!usesTouchFullBleedLayout()) {
							try { document.documentElement.classList.remove("fb-swipe-margins", "fb-swipe-underlay-left", "fb-swipe-underlay-right"); } catch(eCss4) {}
						}
					} catch (e) {}
					setSwipeOverlayAlpha(0);
					clearReveal();
					state.appliedDx = 1e9;
					try {
						if (reader) {
							reader._swipeAnimating = false;
							if (reader._pendingSwipeNeighborLocation && reader.__updateSwipeNeighbors) {
								var pendingLoc = reader._pendingSwipeNeighborLocation;
								reader._pendingSwipeNeighborLocation = null;
								reader.__updateSwipeNeighbors(pendingLoc);
							}
						}
					} catch (eFlush) {}
				}

				function hasRenderableNeighborLayer(isNext) {
					try {
						var layerId = isNext ? "viewer-next" : "viewer-prev";
						var layer = document.getElementById(layerId);
						if (!layer) return false;
						var iframe = layer.querySelector("iframe");
						if (!iframe) return false;
						var doc2 = iframe.contentDocument || null;
						if (!doc2) return false;
						try {
							if (String(doc2.readyState || "").toLowerCase() !== "complete") return false;
						} catch (eReadyState) {}
						var body = doc2.body || null;
						if (!body) return false;
						var text = "";
						try { text = String(body.innerText || body.textContent || "").trim(); } catch (eText) {}
						if (text.length > 24) return true;
						try {
							if (body.querySelector && body.querySelector("img,svg,canvas,video,picture,figure")) return true;
						} catch (eMedia) {}
					} catch (e0) {}
					return false;
				}

					function isRtlReadingOrderSafe() {
						try {
							var md = book && book.package && book.package.metadata ? book.package.metadata : null;
							if (!md) return false;
							var dir = ((md.direction || "") + "").toLowerCase();
							if (dir !== "rtl") return false;
							var lang = ((md.language || md.lang || "") + "").toLowerCase();
							// Do not auto-flip when language is missing; this causes false RTL on many LTR books.
							if (!lang) return false;
							return /^(ar|fa|he|ur|ps|sd|yi|ug|dv|ku|ckb)\b/.test(lang);
						} catch (e) {}
						return false;
					}

				function commitTurn(isNext) {
					if (state.lock) return;
					state.lock = true;
					try {
						if (reader) {
							reader._swipeAnimating = true;
							reader._pendingSwipeNeighborLocation = null;
						}
					} catch (eSwipeFlag) {}
					// Watchdog: epub.js can sometimes take longer to relocate on mobile;
					// never leave the swipe state locked.
					var unlockTimer = null;
					try { unlockTimer = setTimeout(function(){ try { resetTransform(); } catch(e){} state.lock = false; }, 900); } catch(e0) {}
					try {
						var turnDurationMs = 280;
						var settleAfterRelocateMs = 90;
						var rect = stack.getBoundingClientRect();
						var w = rect.width || window.innerWidth || 0;
						var off = isNext ? -w : w;
						var startDx = (isFinite(state.appliedDx) && state.appliedDx !== 1e9) ? state.appliedDx : 0;
						var isDesktopReader = !!(window && window.__fb_isDesktop);
						var canRevealUnderlay = false;
						try {
							canRevealUnderlay = !!(reader && reader.__neighborReadyForTurn && reader.__neighborReadyForTurn(
								reader._lastRelocated || (rendition && rendition.currentLocation && rendition.currentLocation()),
								!!isNext
							));
						} catch (eReady) {}
						if (!canRevealUnderlay && !isDesktopReader) {
							try { canRevealUnderlay = hasRenderableNeighborLayer(!!isNext); } catch (eReadyDom) {}
						}
						if (canRevealUnderlay) {
							setReveal(startDx || (isNext ? -1 : 1));
							try {
								if (shadow) {
									var sw = state.shadowW || (shadow.getBoundingClientRect().width || 6) || 6;
									shadow.style.transition = "left " + turnDurationMs + "ms ease-out";
									shadow.style.left = isNext ? (Math.max(0, w - sw) + "px") : "0px";
								}
							} catch (eShadowInit) {}
						} else {
							try {
								stack.classList.add("swiping");
								setShadow(off);
								setSwipeOverlayAlpha(0);
							} catch (eRevealFallback) {}
						}
						layerCurrent.style.transition = "transform " + turnDurationMs + "ms ease-out";
						layerCurrent.style.transform = "translate3d(" + startDx + "px,0,0)";
						var rafMove = (win && win.requestAnimationFrame) ? win.requestAnimationFrame.bind(win) : function(cb){ return setTimeout(cb, 16); };
						var overlayRaf = 0;
						function stopOverlayAnim() {
							try {
								if (overlayRaf) {
									(win.cancelAnimationFrame || clearTimeout)(overlayRaf);
									overlayRaf = 0;
								}
							} catch (eCancelOverlay) {}
						}
						function animateOverlay(fromDx, toDx) {
							if (!canRevealUnderlay) return;
							stopOverlayAnim();
							var startedAt = null;
							var rafFn = (win && win.requestAnimationFrame) ? win.requestAnimationFrame.bind(win) : function(cb){ return setTimeout(function(){ cb(Date.now()); }, 16); };
							function step(ts) {
								if (startedAt === null) startedAt = ts;
								var p = Math.min(1, Math.max(0, (ts - startedAt) / turnDurationMs));
								var curDx = fromDx + ((toDx - fromDx) * p);
								updateSwipeOverlayAlpha(curDx);
								if (p < 1) {
									overlayRaf = rafFn(step);
								} else {
									overlayRaf = 0;
									updateSwipeOverlayAlpha(toDx);
								}
							}
							overlayRaf = rafFn(step);
						}
						rafMove(function(){
							layerCurrent.style.transform = "translate3d(" + off + "px,0,0)";
							if (canRevealUnderlay) {
								try { setShadow(off); } catch (eShadowMove) {}
								animateOverlay(startDx, off);
							}
						});
						setTimeout(function(){
								try { stopOverlayAnim(); } catch (eStopOverlay) {}
								try { clearRevealOverlayOnly(); } catch (eDim) {}
								try {
									var rtl = isRtlReadingOrderSafe();
									var goNext = isNext;
									if (rtl) goNext = !goNext;
									if (goNext) rendition.next(); else rendition.prev();
							} catch (e) {}
							// After epub.js rerenders, reset transform
							setTimeout(function(){
								try { if (unlockTimer) clearTimeout(unlockTimer); } catch(e0){}
								resetTransform();
								state.lock = false;
							}, settleAfterRelocateMs);
						}, turnDurationMs);
					} catch (e2) {
						try { if (isNext) rendition.next(); else rendition.prev(); } catch(e3) {}
						try { if (unlockTimer) clearTimeout(unlockTimer); } catch(e0){}
						resetTransform();
						state.lock = false;
					}
				}

				function commitTapTurn(isNext) {
						if (state.lock) return;
						try { resetTransform(); } catch (e0) {}
						try {
							var runCommit = function(){
								try { commitTurn(isNext); } catch (e1) {
									try {
										var rtl = isRtlReadingOrderSafe();
										var goNext = isNext;
										if (rtl) goNext = !goNext;
										if (goNext) rendition.next(); else rendition.prev();
									} catch (e2) {}
								}
							};
							try {
								var isIosLike = /iPad|iPhone|iPod/i.test((navigator && navigator.userAgent) || "");
								var isDesktopReader = !!(window && window.__fb_isDesktop);
								if (isDesktopReader) {
									var locForTurn = reader._lastRelocated || (rendition && rendition.currentLocation && rendition.currentLocation());
									try {
										if (reader && reader.__updateSwipeNeighbors && locForTurn) reader.__updateSwipeNeighbors(locForTurn);
									} catch (eRefresh) {}
									((reader && reader.__ensureNeighborRenderedForTurn)
										? reader.__ensureNeighborRenderedForTurn(locForTurn, !!isNext, 420)
										: Promise.resolve())
									.catch(function(){})
									.finally(function(){ runCommit(); });
								} else if (isIosLike && win && typeof win.requestAnimationFrame === "function") {
									try { ensureNeighborsReady().catch(function(){}); } catch (eWarm) {}
									win.requestAnimationFrame(function(){ runCommit(); });
								} else {
									try { ensureNeighborsReady().catch(function(){}); } catch (eWarm2) {}
									runCommit();
								}
							} catch (eRun) {
								runCommit();
							}
						} catch (e3) {
							try {
								var rtl2 = isRtlReadingOrderSafe();
								var goNext2 = isNext;
								if (rtl2) goNext2 = !goNext2;
								if (goNext2) rendition.next(); else rendition.prev();
							} catch (e4) {}
						}
					}

				try {
					doc.__fbQuickSwipeTurn = function(isNext){
						try { commitTapTurn(!!isNext); } catch (e0) {
							try {
								var rtl = isRtlReadingOrderSafe();
								var goNext = !!isNext;
								if (rtl) goNext = !goNext;
								if (goNext) rendition.next(); else rendition.prev();
							} catch (e1) {}
						}
					};
				} catch (eExposeQuickTurn) {}

					function onStart(x, y, target) {
					if (state.lock) return;
					if (isSelectionActive()) return;
						// Mobile: fullscreen MUST be requested synchronously in the same gesture stack.
						// Calling parent via postMessage is async and often only works after several swipes.
						try {
							// IMPORTANT: do NOT request fullscreen on the iframe element.
							// Some Android WebViews will jump to the start of the book and then stop responding.
							var topWin = (win && win.parent) ? win.parent : window;
							if (topWin && typeof topWin.__tryFsFromIframe === 'function') { topWin.__tryFsFromIframe(); }
						} catch(eFs) {}
					var abs = toAbsXY(x, y);
					state.tracking = true;
					state.horizontal = false;
					state.selectionUnlocked = false;
					state.startedOnInteractive = isInteractive(target);
					state.startPhoneEdge = false;
						state.waitingNeighbors = false;
					state.downTs = Date.now();
					state.startX = state.lastX = abs.x;
					state.startY = state.lastY = abs.y;
					state.appliedDx = 1e9;
						state.filteredDx = 0;
						state.lastDir = 0;
							state.lastRawDx = 0;
							state.lastMoveTs = Date.now();
						try {
							state.viewW = stack.getBoundingClientRect().width || window.innerWidth || 0;
							state.shadowW = shadow ? (shadow.getBoundingClientRect().width || 6) : 6;
							if (isPhoneTouchMode()) {
								var phoneStartZone = getPhoneTapZone(abs.x, abs.y);
								state.startPhoneZone = phoneStartZone || "none";
								state.startPhoneEdge = (phoneStartZone === "left" || phoneStartZone === "right");
							} else {
								state.startPhoneZone = "none";
							}
						} catch(e0) { state.viewW = window.innerWidth || 0; state.shadowW = 6; }
					try {
						layerCurrent.style.willChange = "transform";
						try { layerCurrent.style.zIndex = "4"; } catch (eZ) {}
						try {
							var vp = document.getElementById("viewer-prev");
							var vn = document.getElementById("viewer-next");
							if (vp) vp.style.zIndex = "1";
							if (vn) vn.style.zIndex = "1";
						} catch (eZ2) {}
						// Block text selection immediately, then allow it after a long press.
						lockSwipeSelection();
					} catch (e) {}
					armSelectionUnlock();

						// Guarantee neighbors before swipe, but only block if they are actually not ready yet.
						try {
							var neighborsReadyNow = false;
							try {
								neighborsReadyNow = !!(
									reader &&
									reader.__neighborsReadyForLocation &&
									reader.__neighborsReadyForLocation(
										reader._lastRelocated || (rendition && rendition.currentLocation && rendition.currentLocation())
									)
								);
							} catch (eReadyNow) {}
							state.waitingNeighbors = !isTabletMode() && !neighborsReadyNow;
							if (state.waitingNeighbors) {
								ensureNeighborsReady().then(function(){
									state.waitingNeighbors = false;
									// If the finger is still down and we already decided it's a horizontal gesture,
									// apply the current dx immediately.
									try {
										if (state.tracking && state.horizontal && !state.startedOnInteractive) {
											scheduleDx(state.lastX - state.startX);
										}
									} catch(e1){}
								});
							}
						} catch(e0) { state.waitingNeighbors = false; }
				}

				function onMove(ev, x, y) {
					if (!state.tracking || state.lock) return;
					if (state.selectionUnlocked) return;
					if (isSelectionActive()) {
						state.tracking = false;
						clearSelectionTimer();
						state.selectionUnlocked = false;
						unlockSwipeSelection();
						resetTransform();
						return;
					}
					var abs = toAbsXY(x, y);
					state.lastX = abs.x; state.lastY = abs.y;
					var dx = abs.x - state.startX;
					var dy = abs.y - state.startY;
						// Do not quantize/ignore small deltas here.
						// Ignoring micro-deltas causes visible "stutter" when the finger moves slowly.
						state.lastRawDx = dx;
						state.lastMoveTs = Date.now();
					if (!state.horizontal) {
						// Mobile browsers often report small jitter even for a simple tap.
						// Use the same low threshold for edge-start drags so the page follows immediately.
						var horizontalThreshold = 14;
						if (Math.abs(dx) > horizontalThreshold && Math.abs(dx) > Math.abs(dy) * 1.15) {
							clearSelectionTimer();
							state.horizontal = true;
							try {
								doc.documentElement.style.touchAction = "none";
								if (doc.body) doc.body.style.touchAction = "none";
							} catch (e) {}
						}
					}
					if (!state.horizontal) return;
					// Allow footnote taps/links to behave normally
					if (state.startedOnInteractive) return;
					try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
							scheduleDx(dx);
				}

				function onEnd(ev, x, y) {
					if (!state.tracking) return;
					clearSelectionTimer();
					if (isSelectionActive()) {
						state.tracking = false;
						state.selectionUnlocked = false;
						unlockSwipeSelection();
						resetTransform();
						return;
					}
					state.tracking = false;
					unlockSwipeSelection();
					if (state.selectionUnlocked) {
						state.selectionUnlocked = false;
						resetTransform();
						return;
					}

					// If this gesture never became horizontal, treat it as a TAP candidate.
					// IMPORTANT: We implement the UI toggle HERE (inside the same swipe handler)
					// because relying on a separate "tap" listener is unreliable on mobile:
					// Chrome Android can emit both touch + pointer events, and Safari iOS can
					// emit synthetic clicks after touchend. Also, iframes get re-rendered.
					//
					// This branch makes the FBReader-like behavior stable:
					// tap in the central area toggles top/bottom bars.
					if (state.startedOnInteractive) {
						resetTransform();
						return;
					}
					try {
						var __topWinTapSearch0 = (win && win.parent) ? win.parent : window;
						if (__topWinTapSearch0 && __topWinTapSearch0.document && __topWinTapSearch0.document.body && __topWinTapSearch0.document.body.classList.contains("search-open")) {
							resetTransform();
							return;
						}
						if (__topWinTapSearch0 && __topWinTapSearch0.document && __topWinTapSearch0.document.body && __topWinTapSearch0.document.body.classList.contains("mobile-more-open")) {
							try { if (typeof __topWinTapSearch0.__fb_closeMobileMore === "function") __topWinTapSearch0.__fb_closeMobileMore(); } catch (eCloseMore2) {}
							try { __topWinTapSearch0.__fbSuppressUiTapUntil = Date.now() + 600; } catch (eSupMore2) {}
							try { if (ev && typeof ev.preventDefault === "function") ev.preventDefault(); } catch (eP6) {}
							try { if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation(); } catch (eP7) {}
							try { if (ev && ev.stopImmediatePropagation) ev.stopImmediatePropagation(); } catch (eP8) {}
							resetTransform();
							return;
						}
					} catch (eSearchTap0) {}
						var abs = toAbsXY(x, y);
						if (!state.horizontal) {
							try {
								if (typeof x === "number" && typeof y === "number" && doc && typeof doc.__fb_tryFootnoteAtPoint === "function") {
									try {
										if (doc.__fb_tryFootnoteAtPoint(x, y)) {
											if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
											if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
											if (ev && ev.stopImmediatePropagation) ev.stopImmediatePropagation();
											resetTransform();
											return;
										}
									} catch (eFootTap1) {}
								}
								var dxTap = abs.x - state.startX;
								var dyTap = abs.y - state.startY;
							// Be forgiving on Android: a "tap" often has noticeable jitter.
								var moved = (Math.abs(dxTap) > 30 || Math.abs(dyTap) > 30);
								var tapZone = getTabletTapZone(abs.x, abs.y);
								if (tapZone === "none") tapZone = getPhoneTapZone(abs.x, abs.y);
								var effectiveTapZone = tapZone;
								if (isPhoneTouchMode()) {
									if (state.startPhoneZone === "left" || state.startPhoneZone === "right") {
										effectiveTapZone = state.startPhoneZone;
									} else if (state.startPhoneZone === "center" && (tapZone === "left" || tapZone === "right")) {
										effectiveTapZone = "center";
									}
								}
								var inCenter = (effectiveTapZone === "center");
								// Short tap only
								var dt = Date.now() - (state.downTs || Date.now());
								// Some Android devices report longer press durations for a normal tap.
								if (!moved && dt < 900) {
									if (effectiveTapZone === "left" || effectiveTapZone === "right") {
										commitTapTurn(effectiveTapZone === "right");
										if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
										if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
										if (ev && ev.stopImmediatePropagation) ev.stopImmediatePropagation();
									return;
								}
								if (!inCenter) {
									resetTransform();
									return;
								}
								// Debounce globally to avoid double-toggle (touchend + synthetic click).
								// IMPORTANT: store state on the TOP window so it persists across iframe re-renders.
									var now = Date.now();
									var topWin = (win && win.parent) ? win.parent : window;
									if ((topWin.__fbSuppressUiTapUntil || 0) > now) {
										resetTransform();
										return;
									}
									var lastTs = topWin.__fbUiLastToggleTs || 0;
									if ((now - lastTs) > 500) {
										topWin.__fbUiLastToggleTs = now;
										try {
											if (topWin.document && topWin.document.body) {
												topWin.document.body.classList.toggle("ui-hidden");
											}
										} catch (eToggle) {}
										try { topWin.__fbSyncBarHeights && topWin.__fbSyncBarHeights(false); } catch(eSync3) {}
									}
								// Suppress synthetic click after touchend
								if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
								if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
								if (ev && ev.stopImmediatePropagation) ev.stopImmediatePropagation();
							}
						} catch (eTap) {}
						resetTransform();
						return;
					}

					var dx = abs.x - state.startX;
					var dy = abs.y - state.startY;
							// Treat small drags as TAPs (Android jitter): if movement is small, toggle UI in center.
							try {
								if (!state.startedOnInteractive) {
									try {
										var __topWinTapSearch1 = (win && win.parent) ? win.parent : window;
										if (__topWinTapSearch1 && __topWinTapSearch1.document && __topWinTapSearch1.document.body && __topWinTapSearch1.document.body.classList.contains("search-open")) {
											resetTransform();
											return;
										}
										if (__topWinTapSearch1 && __topWinTapSearch1.document && __topWinTapSearch1.document.body && __topWinTapSearch1.document.body.classList.contains("mobile-more-open")) {
											try { if (typeof __topWinTapSearch1.__fb_closeMobileMore === "function") __topWinTapSearch1.__fb_closeMobileMore(); } catch (eCloseMore3) {}
											try { __topWinTapSearch1.__fbSuppressUiTapUntil = Date.now() + 600; } catch (eSupMore3) {}
											try { if (ev && typeof ev.preventDefault === "function") ev.preventDefault(); } catch (eP9) {}
											try { if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation(); } catch (eP10) {}
											try { if (ev && ev.stopImmediatePropagation) ev.stopImmediatePropagation(); } catch (eP11) {}
											resetTransform();
											return;
										}
									} catch (eSearchTap1) {}
									if (typeof x === "number" && typeof y === "number" && doc && typeof doc.__fb_tryFootnoteAtPoint === "function") {
										try {
											if (doc.__fb_tryFootnoteAtPoint(x, y)) {
												if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
												if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
												if (ev && ev.stopImmediatePropagation) ev.stopImmediatePropagation();
												resetTransform();
												return;
											}
										} catch (eFootTap2) {}
									}
									var dtTap2 = Date.now() - (state.downTs || Date.now());
									var rectTap2 = stack.getBoundingClientRect();
									var wTap2 = rectTap2.width || window.innerWidth || 0;
									var tapZone2 = getTabletTapZone(abs.x, abs.y);
									if (tapZone2 === "none") tapZone2 = getPhoneTapZone(abs.x, abs.y);
									var effectiveTapZone2 = tapZone2;
									if (isPhoneTouchMode()) {
										if (state.startPhoneZone === "left" || state.startPhoneZone === "right") {
											effectiveTapZone2 = state.startPhoneZone;
										} else if (state.startPhoneZone === "center" && (tapZone2 === "left" || tapZone2 === "right")) {
											effectiveTapZone2 = "center";
										}
									}
									var inCenter2 = (effectiveTapZone2 === "center");
									var slop = Math.max(35, wTap2 * 0.04); // 4% width, min 35px
									if (dtTap2 < 900 && Math.abs(dx) < slop && Math.abs(dy) < 35) {
											if (effectiveTapZone2 === "left" || effectiveTapZone2 === "right") {
												commitTapTurn(effectiveTapZone2 === "right");
												if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
												if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
												if (ev && ev.stopImmediatePropagation) ev.stopImmediatePropagation();
											return;
										}
									if (!inCenter2) {
										resetTransform();
										return;
									}
									var now2 = Date.now();
									var topWin2 = (win && win.parent) ? win.parent : window;
									if ((topWin2.__fbSuppressUiTapUntil || 0) > now2) {
										resetTransform();
										return;
									}
									var lastTs2 = topWin2.__fbUiLastToggleTs || 0;
										if ((now2 - lastTs2) > 500) {
											topWin2.__fbUiLastToggleTs = now2;
											try { topWin2.document.body.classList.toggle("ui-hidden"); } catch(eT2) {}
											try { topWin2.__fbSyncBarHeights && topWin2.__fbSyncBarHeights(false); } catch(eSync4) {}
										}
									if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
									if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
									if (ev && ev.stopImmediatePropagation) ev.stopImmediatePropagation();
									resetTransform();
									return;
								}
							}
						} catch(eTap2) {}

					var rect = stack.getBoundingClientRect();
					var w = rect.width || window.innerWidth || 0;
					// Turn if the page is dragged by at least 1/5 of the viewport width
					var threshold = Math.max(40, w * 0.20);
					var doTurn = (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.25);
					if (!doTurn) {
						layerCurrent.style.transition = "transform 150ms ease-out";
						layerCurrent.style.transform = "translate3d(0px,0,0)";
						setTimeout(function(){ resetTransform(); }, 160);
						return;
					}

					commitTurn(dx < 0);
					try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
				}

				function _onTouchStart(ev){
					try {
						if (state.pointerActive) return;
						if (!ev.touches || ev.touches.length !== 1) return;
						var t = ev.touches[0];
						onStart(t.clientX, t.clientY, ev.target);
					} catch (e) {}
				}
				function _onTouchMove(ev){
					try {
						if (state.pointerActive) return;
						if (!ev.touches || ev.touches.length !== 1) return;
						var t = ev.touches[0];
						onMove(ev, t.clientX, t.clientY);
					} catch (e) {}
				}
				function _onTouchEnd(ev){
					try {
						if (state.pointerActive) return;
						var t = (ev.changedTouches && ev.changedTouches[0]) ? ev.changedTouches[0] : null;
						if (!t) { resetTransform(); return; }
						onEnd(ev, t.clientX, t.clientY);
					} catch (e) { try { resetTransform(); } catch(e2){} }
				}

				// Capture touch inside the iframe (doesn't bubble to parent)
				doc.addEventListener("touchstart", _onTouchStart, { passive: true, capture: true });
				doc.addEventListener("touchmove", _onTouchMove, { passive: false, capture: true });
				// passive:false so we can reliably preventDefault on iOS/Android when committing the swipe
				doc.addEventListener("touchend", _onTouchEnd, { passive: false, capture: true });
				doc.addEventListener("touchcancel", function(){
					try {
						clearSelectionTimer();
						state.selectionUnlocked = false;
						unlockSwipeSelection();
						resetTransform();
					} catch(e){}
				}, { passive: true, capture: true });
				// Pointer events fallback (some tablets only dispatch pointer events)
				if (win && win.PointerEvent) {
					doc.addEventListener("pointerdown", function(ev){
						try {
							if (!ev || ev.pointerType !== "touch") return;
							state.pointerActive = true;
							state.pointerId = ev.pointerId;
							onStart(ev.clientX, ev.clientY, ev.target);
						} catch (e) {}
					}, { passive: true, capture: true });
					doc.addEventListener("pointermove", function(ev){
						try {
							if (!state.pointerActive || ev.pointerId !== state.pointerId) return;
							onMove(ev, ev.clientX, ev.clientY);
						} catch (e) {}
					}, { passive: false, capture: true });
					doc.addEventListener("pointerup", function(ev){
						try {
							if (!state.pointerActive || ev.pointerId !== state.pointerId) return;
							state.pointerActive = false;
							state.pointerId = null;
							onEnd(ev, ev.clientX, ev.clientY);
						} catch (e) { try { resetTransform(); } catch(e2){} }
					}, { passive: false, capture: true });
					doc.addEventListener("pointercancel", function(ev){
						try {
							if (state.pointerId !== null && ev && ev.pointerId !== state.pointerId) return;
							state.pointerActive = false;
							state.pointerId = null;
						} catch (e) {}
						try {
							clearSelectionTimer();
							state.selectionUnlocked = false;
							unlockSwipeSelection();
						} catch (e1) {}
						try { resetTransform(); } catch(e2){}
					}, { passive: true, capture: true });
				}
			} catch (e) {}
		}

		// Pre-render neighbor pages (prev + next) into the always-mounted renditions.
		// This is what makes the swipe reveal stable and identical on iOS + Android.
		function updateSwipeNeighbors(location) {
			try {
				if (!reader || !reader.book) return;
				if (!reader.renditionPrev || !reader.renditionNext) return;
				// IMPORTANT: show the REAL adjacent page under the swipe.
				// Locations-based math frequently mismatches what the paginated view shows
				// (especially after font/viewport changes) and results in the wrong underlay.
				//
				// Strategy:
				// 1) display the current CFI in the neighbor renditions
				// 2) ask those renditions to go prev() / next() ONCE
				// This guarantees the underlay is exactly the neighboring page for the current layout.

				var curCfi = null;
				try { curCfi = location && location.start && location.start.cfi ? location.start.cfi : null; } catch(e0) {}
				if (!curCfi) {
					try {
						var l = (rendition && typeof rendition.currentLocation === 'function') ? rendition.currentLocation() : null;
						curCfi = l && l.start && l.start.cfi ? l.start.cfi : null;
					} catch(e1) {}
				}
				if (!curCfi) return;
				reader._neighborBaseKeyExpected = String(curCfi);

				// Tokenize to avoid races when fast-swiping.
				reader._neighborPrevReady = false;
				reader._neighborNextReady = false;
				reader._neighborPrevReadyKey = "";
				reader._neighborNextReadyKey = "";
				reader._neighborPrevToken = (reader._neighborPrevToken || 0) + 1;
				reader._neighborNextToken = (reader._neighborNextToken || 0) + 1;
				reader._neighborPrevExpected = reader._neighborPrevToken;
				reader._neighborNextExpected = reader._neighborNextToken;

				var tokPrev = reader._neighborPrevExpected;
				var tokNext = reader._neighborNextExpected;
				var baseKey = String(curCfi);
				Promise.resolve(reader.renditionPrev.display(curCfi))
					.then(function(){
						if (reader._neighborPrevExpected !== tokPrev) return;
						return reader.renditionPrev.prev();
					})
					.then(function(){})
					.catch(function(){});

				Promise.resolve(reader.renditionNext.display(curCfi))
					.then(function(){
						if (reader._neighborNextExpected !== tokNext) return;
						return reader.renditionNext.next();
					})
					.then(function(){})
					.catch(function(){});
			} catch (e) {}
		}
		reader.__updateSwipeNeighbors = updateSwipeNeighbors;

		// ---- /Swipe navigation ----

try { rendition.hooks.content.register(function(contents){ primeThemeForContents(contents, reader.currentTheme || "light"); }); } catch (e) {}
try { rendition.hooks.content.register(attachToDoc); } catch (e) {}

// CRITICAL: Attach swipe/tap handlers via epub.js content hooks as well.
// Relying on rendition.on("rendered", ...) to supply `view.document` is not
// reliable across browsers / WebViews. When that path fails, touch handlers
// end up attached only to the first displayed document, making bar-toggle work
// only on the first page.
try {
  rendition.hooks.content.register(function(contents){
    try { attachSwipeToDoc(contents && contents.document); } catch(e) {}
  });
} catch (e) {}

// Extra safety: attach handlers to any iframe that appears in the viewer.
// Some WebViews recreate iframes without triggering the expected hooks, which causes
// "tap to toggle bars" and "any-gesture fullscreen" to work only on the first page.
(function(){
  function scanIframes(){
    try {
      var iframes = document.querySelectorAll("#viewerStack iframe, #viewer iframe, #viewer-prev iframe, #viewer-next iframe");
      var t = reader.currentTheme || "light";
      var bg = (t === "dark") ? "#000000" : "#FCFAF8";
      for (var i=0;i<iframes.length;i++) {
        var f = iframes[i];
        if (f && f.style) {
          try { f.style.setProperty("background-color", bg, "important"); } catch(e1) {}
        }
        if (f && f.contentDocument) {
          try { applyThemeToDoc(f.contentDocument, t); } catch(e2) {}
          attachToDoc(f.contentDocument);
        }
      }
    } catch(e) {}
  }
  try { scanIframes(); } catch(e) {}
  try { rendition.on("relocated", function(){ scanIframes(); }); } catch(e) {}
  try {
    var vs = document.getElementById("viewerStack");
    if (vs && window.MutationObserver) {
      var mo = new MutationObserver(function(){ scanIframes(); });
      mo.observe(vs, { childList:true, subtree:true });
    }
  } catch(e) {}
})();

		try {
			rendition.on("rendered", function (section, view) {
				try {
					var doc = (view && view.document) || (view && view.contents && view.contents.document) || null;
					try { attachSwipeToDoc(doc); } catch(e) {}
if (doc) {
						try { doc.__epubjsSpineHref = (section && section.href) ? section.href : (section && section.url) ? section.url : doc.__epubjsSpineHref; } catch(eh) {}
						attachToDoc(doc);
						applyThemeToDoc(doc, reader.currentTheme || "light");
					}
				} catch (e2) {}
			});
		} catch (e3) {}
	})(this);

	// On phones, make text larger by default.
	// We do this via rendition themes so it affects the iframe contents.
	var isMobileView = (window.matchMedia && window.matchMedia("(max-width: 768px)").matches);
	if (isMobileView) {
		this.settings.styles = this.settings.styles || {};
		// Match the UI (TOC) scale on phones: keep content font size in sync
		// with the fontSizePct that the UI uses.
		var pct = (this.settings && this.settings.fontSizePct) ? this.settings.fontSizePct : 124;
		this.settings.styles.fontSize = pct + "%";
	}
	if (this.settings.styles && this.settings.styles.fontSize) {
		this.rendition.themes.fontSize(this.settings.styles.fontSize);
		try { this.renditionPrev.themes.fontSize(this.settings.styles.fontSize); } catch(e1) {}
		try { this.renditionNext.themes.fontSize(this.settings.styles.fontSize); } catch(e2) {}
	}

	// UI toggle (link in title bar)
	var themeToggleEl = document.getElementById("themeToggle");
	if (themeToggleEl) {
		themeToggleEl.addEventListener("click", function (ev) {
			ev.preventDefault();
			var next = (reader.currentTheme === "dark") ? "light" : "dark";
			reader.currentTheme = next;
			reader.rendition.themes.select(next);
			try { reader.renditionPrev.themes.select(next); } catch(e1) {}
			try { reader.renditionNext.themes.select(next); } catch(e2) {}
			// Update main footnote modal theme immediately (if present)
			try {
				if (reader.__applyMainFootnoteModalTheme) reader.__applyMainFootnoteModalTheme(next);
			} catch (e) {}
				// Update already-created footnote popups immediately
				try {
					reader.rendition.views().forEach(function(v){
						// epub.js views differ across versions: try both v.document and v.contents.document
						var d = (v && v.document) || (v && v.contents && v.contents.document) || null;
						if (d && d.__epubjsFootnotePopup) {
							if (reader.__applyFootnotePopupTheme) reader.__applyFootnotePopupTheme(d, d.__epubjsFootnotePopup, next);
						}
					});
				} catch(e) {}
			$("body").toggleClass("dark-ui", next === "dark");
			applyThemeToIframes(next);
			try { if (window.__fbScheduleLayoutSync) window.__fbScheduleLayoutSync(); } catch(eSyncTheme) {}
});
	}

	// -----------------------------
	// Footer progress: global page X/Y across the whole book
	// -----------------------------
	var pageCountEl = document.getElementById("page-count");
	var pageCountTextEl = null;
	var pageCounterForceIosPaint = false;
	try {
		var uaPc = navigator.userAgent || "";
		var iOSP = /iP(ad|hone|od)/i.test(uaPc);
		var iPadOSP = /Macintosh/i.test(uaPc) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1;
		pageCounterForceIosPaint = !!(iOSP || iPadOSP);
	} catch (ePcIos) {}

	function ensurePageCountTextEl() {
		if (!pageCountEl) return null;
		if (pageCountTextEl && pageCountTextEl.parentNode === pageCountEl) return pageCountTextEl;
		try {
			var found = pageCountEl.querySelector(".pc-text");
			if (found) {
				pageCountTextEl = found;
				return pageCountTextEl;
			}
		} catch (e0) {}
		try {
			var span = document.createElement("span");
			span.className = "pc-text";
			span.setAttribute("aria-hidden", "true");
			pageCountEl.appendChild(span);
			pageCountTextEl = span;
			return pageCountTextEl;
		} catch (e1) {}
		return null;
	}

	function renderPageCountLabel(label) {
		if (!pageCountEl) return;
		var text = String(label || "");
		if (!text) text = ".../...";
		var textEl = ensurePageCountTextEl();
		try {
			if (textEl) textEl.textContent = text;
			else pageCountEl.textContent = text;
		} catch (e0) {}
		try {
			if (!textEl) pageCountEl.innerText = text;
		} catch (e1) {}
		try { pageCountEl.setAttribute("data-page-counter", text); } catch (e2) {}
		try { pageCountEl.setAttribute("aria-label", text); } catch (e2a) {}
		try {
			pageCountEl.style.display = "inline-block";
			pageCountEl.style.visibility = "visible";
			pageCountEl.style.opacity = "1";
			pageCountEl.style.color = "#d0d0d0";
			pageCountEl.style.fontSize = "14px";
			pageCountEl.style.whiteSpace = "nowrap";
			if (pageCounterForceIosPaint) pageCountEl.style.webkitTextFillColor = "#d0d0d0";
			else pageCountEl.style.webkitTextFillColor = "currentColor";
			if (textEl) {
				textEl.style.display = "inline-block";
				textEl.style.visibility = "visible";
				textEl.style.opacity = "1";
				textEl.style.color = "#d0d0d0";
				if (pageCounterForceIosPaint) textEl.style.webkitTextFillColor = "#d0d0d0";
				else textEl.style.webkitTextFillColor = "currentColor";
				textEl.style.fontSize = "14px";
				textEl.style.whiteSpace = "nowrap";
				textEl.style.lineHeight = "1.1";
				textEl.style.fontVariantLigatures = "none";
			}
		} catch (e3) {}
	}

	function getPageCountMaxLabelWidth() {
		try {
			var bottomBarEl = document.getElementById("bottombar");
			if (!bottomBarEl) return 0;
			var w = Math.floor((bottomBarEl.clientWidth || 0) * 0.8);
			return w > 0 ? w : 0;
		} catch (e) {}
		return 0;
	}

	function measurePageCountLabelWidth(label) {
		try {
			var textEl = ensurePageCountTextEl();
			if (!textEl) return 0;
			var prev = textEl.textContent || "";
			textEl.textContent = String(label || "");
			// scrollWidth gives the intrinsic width even if element is centered/overflow-hidden.
			var w = textEl.scrollWidth || textEl.offsetWidth || 0;
			textEl.textContent = prev;
			return w;
		} catch (e) {}
		return 0;
	}

	function buildFittedPageCounterLabel(pageLabel, tocTitle) {
		var pageOnly = String(pageLabel || "");
		return pageOnly;
	}
	try {
		if (pageCountEl && !String(pageCountEl.textContent || "").trim()) {
			renderPageCountLabel("…/…");
		}
	} catch (ePageInit) {}
	this.totalPages = 0;
	this._locationsChars = 1600;
	this._regenLocationsTimer = null;
	this._tocMap = null;
	this._tocList = null;
	this._lastRelocated = null;
	this._swipeAnimating = false;
	this._pendingSwipeNeighborLocation = null;
	this._spineHrefToIndex = Object.create(null);
	this._globalPageMap = {
		ready: false,
		key: "",
		totalPages: 0,
		sectionTotals: [],
		sectionOffsets: []
	};
	this._globalPageMapBuildToken = 0;
	this._globalPageMapBuilding = false;
	this._globalPageMapQueued = false;
	this._globalPageMapQueuedForce = false;
	this._globalPageMapTimer = null;
	this._globalPageMapTimerForce = false;
	this._pageCalcHost = null;
	this._pageCalcRendition = null;
	this._globalPageMapQuickCache = Object.create(null);
	this._globalPageMapExactCache = Object.create(null);
	this._globalPageMapExactBuilding = false;
	this._globalPageMapExactKey = "";
	this._navInProgressUntil = 0;
	this._pageCounterPending = false;
	this._pageCounterPendingTimer = null;
	this._pageCounterPendingSince = 0;
	this._lastStablePageCounterText = "";
	this._globalPageMapBuildWatchdog = null;

	function setPageCounterPending(pending) {
		reader._pageCounterPending = !!pending;
		try {
			if (reader._pageCounterPendingTimer) {
				clearTimeout(reader._pageCounterPendingTimer);
				reader._pageCounterPendingTimer = null;
			}
		} catch (e0) {}
		if (!reader._pageCounterPending) {
			reader._pageCounterPendingSince = 0;
		}
		if (reader._pageCounterPending) {
			reader._pageCounterPendingSince = Date.now();
			if (pageCountEl) {
				var currentText = String(pageCountEl.textContent || "").trim();
				if (currentText && currentText !== "…/…") {
					reader._lastStablePageCounterText = currentText;
				}
				var locPending = getCurrentLocationSafe();
				var pendingGlobal = getGlobalPageFromLocationsFallback(locPending);
				if (pendingGlobal && pendingGlobal.total) {
					var pendingPageLabel = String(pendingGlobal.page) + "/" + String(pendingGlobal.total);
					var pendingTocTitle = getTocTitleForLocation(locPending);
					renderPageCountLabel(buildFittedPageCounterLabel(pendingPageLabel, pendingTocTitle));
				} else {
					renderPageCountLabel("…/…");
				}
			}
			// Fail-open timeout is needed only on touch/iOS (resize-noise contexts).
			// On desktop it causes a visible rollback to old numbers while recount is still running.
			var allowFailOpen = false;
			try {
				var coarse = !!(window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches);
				var touchCapable = !!((navigator && navigator.maxTouchPoints > 0) || ("ontouchstart" in window));
				allowFailOpen = coarse || touchCapable || isIosResizeNoiseContext();
			} catch (eAllow) {}
			if (allowFailOpen) {
				reader._pageCounterPendingTimer = setTimeout(function () {
					if (!reader._pageCounterPending) return;
					setPageCounterPending(false);
					try {
						if (pageCountEl && reader._lastStablePageCounterText) {
							renderPageCountLabel(reader._lastStablePageCounterText);
						}
					} catch (e1) {}
					try {
						var mapReady = !!(reader._globalPageMap && reader._globalPageMap.ready && reader._globalPageMap.totalPages);
						if (mapReady) {
							var locNow = reader._lastRelocated || (reader.rendition && reader.rendition.currentLocation ? reader.rendition.currentLocation() : null);
							if (locNow) updatePageCount(locNow);
						}
					} catch (e2) {}
				}, 5000);
			}
		}
	}

	function getCurrentLocationSafe() {
		try {
			var loc = reader._lastRelocated || null;
			if (loc) return loc;
		} catch (e0) {}
		try {
			return (reader.rendition && reader.rendition.currentLocation) ? reader.rendition.currentLocation() : null;
		} catch (e1) {}
		return null;
	}

	function schedulePageCounterRecovery(reason) {
		try {
			// iOS: recovery polling can race with first TOC navigation and cause blank-page transitions.
			// Keep iOS stable and rely on direct relocated updates + CSS fallback rendering.
			if (isIosResizeNoiseContext()) return;
		} catch (eIosGuard) {}
		try {
			if (reader._pageCounterRecoveryTimer) clearTimeout(reader._pageCounterRecoveryTimer);
		} catch (e0) {}
		try { reader._pageCounterRecoveryTries = 0; } catch (e1) {}
		reader._pageCounterRecoveryTimer = setTimeout(function tick() {
			reader._pageCounterRecoveryTimer = null;
			try {
				if (reader._navInProgressUntil && Date.now() < reader._navInProgressUntil) {
					reader._pageCounterRecoveryTimer = setTimeout(tick, 320);
					return;
				}
			} catch (eNavWait) {}
			var txt = "";
			try { txt = String((pageCountEl && pageCountEl.textContent) || "").trim(); } catch (eTxt) { txt = ""; }
			var waiting = !txt || txt === "…/…" || reader._pageCounterPending;
			if (!waiting) return;
			try {
				var locNow = getCurrentLocationSafe();
				if (locNow) updatePageCount(locNow);
			} catch (e2) {}
			var tries = 0;
			try { tries = (reader._pageCounterRecoveryTries || 0) + 1; reader._pageCounterRecoveryTries = tries; } catch (e3) { tries = 1; }
			if (tries < 28) {
				reader._pageCounterRecoveryTimer = setTimeout(tick, 360);
			}
		}, 220);
	}

	function markNavigationInProgress(ms) {
		var hold = parseInt(ms, 10);
		if (!hold || isNaN(hold) || hold < 200) hold = 1200;
		try { reader._navInProgressUntil = Date.now() + hold; } catch (e) {}
	}
	reader.__markNavigationInProgress = markNavigationInProgress;

	function normalizeHref(href) {
		if (!href) return "";
		var h = String(href).trim();
		try {
			if (/^https?:\/\//i.test(h)) {
				h = new URL(h).pathname || h;
			}
		} catch (eUrl) {}
		// Strip fragment
		h = h.split("#")[0];
		try {
			h = h.replace(/^.*\/books\/content\/[^/]+\/[^/]+\//, "");
			h = h.replace(/^.*\/books\/content\/[^/]+\//, "");
			h = h.replace(/^.*\/(c|r|s)\//, "$1/");
		} catch (ePathStrip) {}
		h = h.replace(/^\/+/, "");
		h = h.replace(/^(\.\.\/)+/, "");
		// Normalize leading slashes
		h = h.replace(/^\.\//, "");
		return h;
	}

	function flattenToc(toc, out) {
		out = out || [];
		if (!toc) return out;
		for (var i = 0; i < toc.length; i++) {
			var item = toc[i];
			if (!item) continue;
			out.push(item);
			if (item.subitems && item.subitems.length) flattenToc(item.subitems, out);
		}
		return out;
	}

	function buildTocMap(toc) {
		var map = Object.create(null);
		var flat = flattenToc(toc, []);
		for (var i = 0; i < flat.length; i++) {
			var it = flat[i];
			var href = normalizeHref(it.href || it.url || "");
			if (!href) continue;
			var label = (it.label && (it.label.trim ? it.label.trim() : it.label)) || it.title || "";
			if (!label) continue;
			// Prefer the first label for a given href
			if (!map[href]) map[href] = label;
		}
		reader._tocList = flat;
		reader._tocMap = map;
	}

	function getTocTitleForLocation(loc) {
		try {
			if (!reader || !reader.book) return "";
			var href = "";
			if (loc && loc.start && loc.start.href) href = loc.start.href;
			if (!href && loc && loc.start && loc.start.cfi && reader.book.spine) {
				var item = reader.book.spine.get(loc.start.cfi);
				if (item && item.href) href = item.href;
			}
			href = normalizeHref(href);
			if (!href) return "";
			if (reader._tocMap && reader._tocMap[href]) return reader._tocMap[href];
			return "";
		} catch (e) {
			return "";
		}
	}

	function getCurrentSpreadMode() {
		var isMobile = (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) || window.innerWidth <= 768;
		return isMobile ? "none" : "auto";
	}

	function isReaderNewCompatGapMode() {
		try {
			var params = new URLSearchParams(window.location.search || "");
			return params.get("readerNewCompatGap") === "1";
		} catch (e) {}
		return false;
	}

	function computeReaderNewCompatGapMetrics() {
		var disabled = { enabled: false, gap: null, extraInset: 0, sideInset: null, pageInset: 0 };
		if (!isReaderNewCompatGapMode()) return disabled;
		if (getCurrentSpreadMode() === "none") return disabled;
		try {
			var currentExtraInset = 0;
			try {
				var extraInsetRaw = window.getComputedStyle(document.documentElement).getPropertyValue("--readernew-compat-extra-inset");
				currentExtraInset = parseFloat(extraInsetRaw) || 0;
			} catch (eInset) {}
			var viewportWidth = Math.max(
				1,
				Math.round(
					(window.visualViewport && window.visualViewport.width) ||
					window.innerWidth ||
					document.documentElement.clientWidth ||
					1
				)
			);
			var viewerStack = document.getElementById("viewerStack");
			var computedViewerSide = 0;
			if (viewerStack && window.getComputedStyle) {
				var stackStyle = window.getComputedStyle(viewerStack);
				computedViewerSide = Math.max(0, (parseFloat(stackStyle.left) || 0) - currentExtraInset);
			}
			var baseWidth = Math.max(1, Math.round(viewportWidth - computedViewerSide * 2));
			var section = Math.floor(baseWidth / 12);
			var autoGap = section % 2 === 0 ? section : Math.max(0, section - 1);
			var currentCompatGap = Math.max(24, autoGap - 50);
			var targetGap = currentCompatGap;
			var extraInset = 0;
			return {
				enabled: true,
				gap: targetGap,
				extraInset: extraInset,
				sideInset: targetGap,
				pageInset: Math.round(targetGap / 2)
			};
		} catch (e) {}
		return disabled;
	}

	function applyReaderNewCompatGapMetrics() {
		var metrics = computeReaderNewCompatGapMetrics();
		try {
			document.documentElement.style.setProperty(
				"--readernew-compat-extra-inset",
				metrics.enabled ? (metrics.extraInset + "px") : "0px"
			);
			document.documentElement.style.setProperty(
				"--readernew-compat-page-inset",
				(metrics.enabled && typeof metrics.pageInset === "number") ? (metrics.pageInset + "px") : "0px"
			);
		} catch (e0) {}
		try {
			if (reader) {
				reader._readerNewCompatGapMetrics = metrics;
				if (metrics.enabled && typeof metrics.gap === "number") {
					reader.settings = reader.settings || {};
					reader.settings.gap = metrics.gap;
				} else if (reader.settings && Object.prototype.hasOwnProperty.call(reader.settings, "gap")) {
					delete reader.settings.gap;
				}
			}
		} catch (e1) {}
		var renditions = [
			reader && reader.rendition,
			reader && reader.renditionPrev,
			reader && reader.renditionNext,
			reader && reader._pageCalcRendition
		];
		for (var i = 0; i < renditions.length; i++) {
			try {
				if (!renditions[i]) continue;
				if (metrics.enabled && typeof metrics.gap === "number") {
					renditions[i].settings.gap = metrics.gap;
				} else if (renditions[i].settings && Object.prototype.hasOwnProperty.call(renditions[i].settings, "gap")) {
					delete renditions[i].settings.gap;
				}
			} catch (e2) {}
		}
		return metrics;
	}

	function getViewerSize() {
		var stack = document.getElementById("viewerStack");
		if (stack && stack.getBoundingClientRect) {
			var rs = stack.getBoundingClientRect();
			var ws = Math.max(1, Math.round(rs.width || 0));
			var hs = Math.max(1, Math.round(rs.height || 0));
			if (ws > 1 && hs > 1) return { width: ws, height: hs };
		}
		var viewer = document.getElementById("viewer");
		if (viewer && viewer.getBoundingClientRect) {
			var r = viewer.getBoundingClientRect();
			var w = Math.max(1, Math.round(r.width || 0));
			var h = Math.max(1, Math.round(r.height || 0));
			if (w > 1 && h > 1) return { width: w, height: h };
		}
		return {
			width: Math.max(1, Math.round(window.innerWidth || 1)),
			height: Math.max(1, Math.round(window.innerHeight || 1))
		};
	}

	function getPageLayoutKey() {
		var size = getViewerSize();
		return [
			size.width,
			size.height,
			getUiFontPct(),
			getCurrentSpreadMode()
		].join("|");
	}

	function isSpineItemLinear(item) {
		try {
			if (!item) return false;
			if (item.linear === false) return false;
			var lin = (item.linear == null) ? "yes" : String(item.linear).toLowerCase();
			if (lin === "no" || lin === "false" || lin === "0") return false;
			return true;
		} catch (e) {
			return true;
		}
	}

	function ensureSpineHrefIndex() {
		try {
			reader._spineHrefToIndex = Object.create(null);
			var items = (reader.book && reader.book.spine && reader.book.spine.spineItems) ? reader.book.spine.spineItems : [];
			for (var i = 0; i < items.length; i++) {
				var h = normalizeHref(items[i] && items[i].href);
				if (h && reader._spineHrefToIndex[h] == null) {
					reader._spineHrefToIndex[h] = i;
				}
				var base = h ? h.split("/").pop() : "";
				if (base && reader._spineHrefToIndex[base] == null) {
					reader._spineHrefToIndex[base] = i;
				}
			}
		} catch (e) {}
	}

	function isJsonManifestBook() {
		try {
			return !!(reader && reader.book && reader.book.package && reader.book.package.isJsonManifest);
		} catch (e) {}
		return false;
	}

	function ensurePageCalcRendition(reset) {
		var compatMetrics = applyReaderNewCompatGapMetrics();
		var size = getViewerSize();
		if (!reader._pageCalcHost) {
			var host = document.createElement("div");
			host.id = "reader-pagecalc-host";
			host.setAttribute("aria-hidden", "true");
			host.style.position = "fixed";
			host.style.left = "-20000px";
			host.style.top = "0";
			host.style.opacity = "0";
			host.style.pointerEvents = "none";
			host.style.overflow = "hidden";
			host.style.zIndex = "-1";
			document.body.appendChild(host);
			reader._pageCalcHost = host;
		}
		if (reset && reader._pageCalcRendition) {
			try {
				if (reader._pageCalcRendition.destroy) reader._pageCalcRendition.destroy();
			} catch (eDestroy) {}
			reader._pageCalcRendition = null;
			try { reader._pageCalcHost.innerHTML = ""; } catch (eClear) {}
		}
		reader._pageCalcHost.style.width = size.width + "px";
		reader._pageCalcHost.style.height = size.height + "px";

		if (!reader._pageCalcRendition) {
			reader._pageCalcRendition = reader.book.renderTo(reader._pageCalcHost, {
				ignoreClass: "annotator-hl",
				width: "100%",
				height: "100%",
				spread: getCurrentSpreadMode(),
				flow: "paginated",
				gap: compatMetrics.enabled ? compatMetrics.gap : undefined
			});
			try { reader._pageCalcRendition.themes.register("light", lightThemeCss); } catch (e0) {}
			try { reader._pageCalcRendition.themes.register("dark", darkThemeCss); } catch (e01) {}
		}

		try {
			if (reader._pageCalcRendition.spread) reader._pageCalcRendition.spread(getCurrentSpreadMode());
		} catch (e1) {}
		try {
			if (reader._pageCalcRendition.resize) reader._pageCalcRendition.resize(size.width, size.height);
		} catch (e2) {}
		try {
			var fs = reader && reader.settings && reader.settings.styles && reader.settings.styles.fontSize
				? reader.settings.styles.fontSize
				: null;
			if (fs && reader._pageCalcRendition.themes && reader._pageCalcRendition.themes.fontSize) {
				reader._pageCalcRendition.themes.fontSize(fs);
			}
		} catch (e3) {}
		try {
			if (reader.currentTheme && reader._pageCalcRendition.themes && reader._pageCalcRendition.themes.select) {
				reader._pageCalcRendition.themes.select(reader.currentTheme);
			}
		} catch (e4) {}
	}

	function getSpineIndexFromLocation(loc) {
		try {
			if (loc && loc.start && typeof loc.start.index === "number") return loc.start.index;
		} catch (e0) {}
		try {
			var cfi = loc && loc.start && loc.start.cfi ? loc.start.cfi : null;
			if (cfi && reader.book && reader.book.spine && typeof reader.book.spine.get === "function") {
				var item = reader.book.spine.get(cfi);
				if (item && typeof item.index === "number") return item.index;
			}
		} catch (e1) {}
		try {
			var href = normalizeHref(loc && loc.start && loc.start.href ? loc.start.href : "");
			if (href && reader._spineHrefToIndex && reader._spineHrefToIndex[href] != null) {
				return reader._spineHrefToIndex[href];
			}
			var base = href ? href.split("/").pop() : "";
			if (base && reader._spineHrefToIndex && reader._spineHrefToIndex[base] != null) {
				return reader._spineHrefToIndex[base];
			}
		} catch (e2) {}
		return -1;
	}

	function getGlobalPageFromLocation(loc) {
		try {
			var map = reader._globalPageMap;
			if (!map || !map.ready || !map.totalPages) return null;
			var spineIndex = getSpineIndexFromLocation(loc);
			if (spineIndex < 0 || spineIndex >= map.sectionTotals.length) return null;
			var localTotal = parseInt(map.sectionTotals[spineIndex], 10);
			if (!localTotal || isNaN(localTotal) || localTotal < 1) {
				var fallbackPage = 1;
				for (var j = 0; j <= spineIndex; j++) {
					var jt = parseInt(map.sectionTotals[j], 10);
					if (!jt || isNaN(jt) || jt < 1) continue;
					var jo = parseInt(map.sectionOffsets[j], 10);
					if (isNaN(jo) || jo < 0) jo = 0;
					fallbackPage = jo + 1;
				}
				if (fallbackPage > map.totalPages) fallbackPage = map.totalPages;
				return { page: fallbackPage, total: map.totalPages };
			}
			var localPage = 1;
			if (loc && loc.start && loc.start.displayed && typeof loc.start.displayed.page === "number") {
				localPage = parseInt(loc.start.displayed.page, 10);
			}
			if (!localPage || isNaN(localPage) || localPage < 1) localPage = 1;
			if (localPage > localTotal) localPage = localTotal;
			var offset = parseInt(map.sectionOffsets[spineIndex] || 0, 10);
			if (isNaN(offset) || offset < 0) offset = 0;
			var globalPage = offset + localPage;
			if (globalPage < 1) globalPage = 1;
			if (globalPage > map.totalPages) globalPage = map.totalPages;
			return { page: globalPage, total: map.totalPages };
		} catch (e) {
			return null;
		}
	}

	function getGlobalPageFromLocationsFallback(loc) {
		try {
			if (!reader || !reader.book || !reader.book.locations) return null;
			var locations = reader.book.locations;
			var total = parseInt(locations.total || 0, 10);
			if (!total || isNaN(total) || total < 1) return null;
			var cfi = "";
			var pctF = null;
			try {
				cfi = (loc && loc.start && loc.start.cfi) ? String(loc.start.cfi) : "";
			} catch (eCfi) {}
			if (cfi && typeof locations.percentageFromCfi === "function") {
				pctF = locations.percentageFromCfi(cfi);
			}
			if ((typeof pctF !== "number" || isNaN(pctF)) && loc && loc.start && typeof loc.start.percentage === "number") {
				pctF = loc.start.percentage;
			}
			if ((typeof pctF !== "number" || isNaN(pctF)) && loc && loc.end && typeof loc.end.percentage === "number") {
				pctF = loc.end.percentage;
			}
			if (typeof pctF !== "number" || isNaN(pctF)) return null;
			if (pctF < 0) pctF = 0;
			if (pctF > 1) pctF = 1;
			var page = Math.round(pctF * (total - 1)) + 1;
			if (!page || isNaN(page) || page < 1) page = 1;
			if (page > total) page = total;
			return { page: page, total: total };
		} catch (e) {
			return null;
		}
	}

	window.__fbGetGlobalPageLabelForCfi = function(cfi) {
		try {
			var cfiText = String(cfi || "").trim();
			if (!cfiText) return "";
			var loc = { start: { cfi: cfiText } };
			var resolved = getGlobalPageFromLocation(loc);
			if (!resolved || !resolved.page) {
				resolved = getGlobalPageFromLocationsFallback(loc);
			}
			if (!resolved || !resolved.page) return "";
			return String(resolved.page);
		} catch (_error) {
			return "";
		}
	};

	function getUiFontPct() {
		try {
			// settings.styles.fontSize like "124%"
			if (reader && reader.settings && reader.settings.styles && reader.settings.styles.fontSize) {
				var v = parseInt(String(reader.settings.styles.fontSize).replace(/[^0-9]/g, ""), 10);
				if (v && !isNaN(v)) return v;
			}
		} catch (e) {}
		return 100;
	}

	function setFontPct(pct) {
		// pct is number (e.g. 80, 90, 100, 110, 120)
		try {
			var n = parseInt(pct, 10);
			if (!n || isNaN(n)) return;
			// Show "recalculating" state immediately on the first tap/click.
			setPageCounterPending(true);
			var value = n + "%";
			reader.settings.styles = reader.settings.styles || {};
			reader.settings.styles.fontSize = value;
			reader.settings.fontSizePct = n;
			// Apply to book contents
			try {
				if (reader.book && typeof reader.book.setStyle === "function") {
					reader.book.setStyle("fontSize", value);
				}
			} catch (e1) {}
			try { reader.rendition.themes.fontSize(value); } catch (e2) {}
			// Keep UI scale (TOC etc.) in sync
			try { _applyUiScale(value); } catch (e3) {}
			// Update footer + bookmarks after reflow settles.
			try {
				if (reader._fontUiTimer) clearTimeout(reader._fontUiTimer);
				reader._fontUiTimer = setTimeout(function(){
					updateBookmarkLabelsIfPossible();
					scheduleGlobalPageMapRebuild("font-size", true);
				}, 120);
			} catch (e4) {}
		} catch (e) {}
	}

	function updateBookmarkLabelsIfPossible() {
		try {
			if (reader && reader.BookmarksController && typeof reader.BookmarksController.refresh === 'function') {
				reader.BookmarksController.refresh();
			}
		} catch (e) {}
	}

	// For percent progress we need a single, stable Locations map for the whole book.
	// Generate once at a fixed granularity and NEVER regenerate it on resize/font changes,
	// otherwise the same CFI would map to different percentages.
	function generateLocationsOnce() {
		if (!reader.book || !reader.book.locations) return Promise.resolve();
		var chars = 1600;
		reader._locationsChars = chars;
		return reader.book.locations.generate(chars).then(function(){
			reader.totalPages = reader.book.locations.total || 0;
			var loc = reader.rendition.currentLocation();
			if (loc) updatePageCount(loc);
			updateBookmarkLabelsIfPossible();
			reader.trigger("reader:locationsChanged", chars);
			// IMPORTANT: neighbor swipe preview must be ready BEFORE the first swipe.
			// On initial load, relocated can fire before Locations are generated, which
			// previously prevented prev/next from being displayed. This makes the first
			// swipe show an empty (grey) underlay. Force a neighbor refresh now.
			try {
				var l = reader._lastRelocated || reader.rendition.currentLocation();
				if (reader.__updateSwipeNeighbors && l) reader.__updateSwipeNeighbors(l);
			} catch (e0) {}
		});
	}
	reader.__generateLocationsOnce = generateLocationsOnce;
	reader.__setFontPct = setFontPct;
	reader._userInteractionTs = Date.now();

	function markReaderInteraction() {
		try { reader._userInteractionTs = Date.now(); } catch (e) {}
	}

	function waitFrame() {
		return new Promise(function (resolve) {
			try {
				if (window.requestAnimationFrame) {
					window.requestAnimationFrame(function () { resolve(); });
					return;
				}
			} catch (e0) {}
			setTimeout(resolve, 0);
		});
	}

	function waitForResponsiveSlot() {
		var last = 0;
		try { last = parseInt(reader._userInteractionTs || 0, 10) || 0; } catch (e0) {}
		var elapsed = Date.now() - last;
		var extraDelay = (elapsed < 220) ? 120 : 0;
		return new Promise(function (resolve) {
			setTimeout(function () {
				waitFrame().then(resolve);
			}, extraDelay);
		});
	}

	function getLocationFingerprint(loc) {
		try {
			var href = normalizeHref(loc && loc.start && loc.start.href ? loc.start.href : "");
			var cfi = (loc && loc.start && loc.start.cfi) ? String(loc.start.cfi) : "";
			var page = (loc && loc.start && loc.start.displayed && typeof loc.start.displayed.page === "number")
				? parseInt(loc.start.displayed.page, 10)
				: 0;
			if (!page || isNaN(page) || page < 0) page = 0;
			return href + "|" + cfi + "|" + String(page);
		} catch (e) {
			return "";
		}
	}

	function extractDisplayedTotal(loc) {
		try {
			var t = 0;
			if (loc && loc.start && loc.start.displayed && typeof loc.start.displayed.total === "number") {
				t = loc.start.displayed.total;
			}
			if (!t && loc && loc.end && loc.end.displayed && typeof loc.end.displayed.total === "number") {
				t = loc.end.displayed.total;
			}
			t = parseInt(t, 10);
			if (!t || isNaN(t) || t < 1) t = 1;
			return t;
		} catch (e) {
			return 1;
		}
	}

	function clonePageMap(map) {
		if (!map) return null;
		return {
			ready: !!map.ready,
			key: map.key || "",
			totalPages: parseInt(map.totalPages, 10) || 1,
			sectionTotals: (map.sectionTotals || []).slice(0),
			sectionOffsets: (map.sectionOffsets || []).slice(0),
			isExact: !!map.isExact
		};
	}

	function createPageMapFromSectionTotals(key, sectionTotals, isExact) {
		var totals = (sectionTotals || []).slice(0);
		var offsets = new Array(totals.length);
		var sum = 0;
		for (var i = 0; i < totals.length; i++) {
			offsets[i] = sum;
			var t = parseInt(totals[i], 10);
			if (!t || isNaN(t) || t < 1) {
				totals[i] = 0;
				continue;
			}
			totals[i] = t;
			sum += t;
		}
		if (sum < 1) sum = 1;
		return {
			ready: true,
			key: key,
			totalPages: sum,
			sectionTotals: totals,
			sectionOffsets: offsets,
			isExact: !!isExact
		};
	}

	function pageMapsEqual(a, b) {
		if (!a || !b) return false;
		if ((a.key || "") !== (b.key || "")) return false;
		if ((parseInt(a.totalPages, 10) || 0) !== (parseInt(b.totalPages, 10) || 0)) return false;
		var at = a.sectionTotals || [];
		var bt = b.sectionTotals || [];
		if (at.length !== bt.length) return false;
		for (var i = 0; i < at.length; i++) {
			var av = parseInt(at[i], 10) || 0;
			var bv = parseInt(bt[i], 10) || 0;
			if (av !== bv) return false;
		}
		return true;
	}

	function applyGlobalPageMap(map, clearPending) {
		if (!map) return;
		reader._globalPageMap = clonePageMap(map);
		reader.totalPages = reader._globalPageMap.totalPages || 1;
		if (clearPending !== false) setPageCounterPending(false);
		var locNow = getCurrentLocationSafe();
		if (locNow) updatePageCount(locNow);
		else schedulePageCounterRecovery("apply-map-no-loc");
	}

	function countSectionPagesQuick(item, token) {
		var target = item && (item.href || item.url || item.cfiBase || null);
		if (!target || !reader._pageCalcRendition) return Promise.resolve(1);
		return waitForResponsiveSlot().then(function () {
			return reader._pageCalcRendition.display(target);
		}).then(function () {
			return waitForResponsiveSlot();
		}).then(function () {
			return waitForResponsiveSlot();
		}).then(function () {
			if (token !== reader._globalPageMapBuildToken) return 1;
			var loc = reader._pageCalcRendition.currentLocation ? reader._pageCalcRendition.currentLocation() : null;
			return extractDisplayedTotal(loc);
		}).catch(function () {
			return 1;
		});
	}

	function countSectionPages(item, sectionIndex, token) {
		var target = item && (item.href || item.url || item.cfiBase || null);
		if (!target || !reader._pageCalcRendition) return Promise.resolve(1);

		return reader._pageCalcRendition.display(target).then(function () {
			if (token !== reader._globalPageMapBuildToken) return 1;

			var startLoc = reader._pageCalcRendition.currentLocation ? reader._pageCalcRendition.currentLocation() : null;
			var activeSectionIndex = getSpineIndexFromLocation(startLoc);
			if (activeSectionIndex < 0) activeSectionIndex = sectionIndex;
			var activeHref = normalizeHref(
				(startLoc && startLoc.start && startLoc.start.href)
					? startLoc.start.href
					: (item && item.href ? item.href : "")
			);

			var pages = 1;
			var guard = 0;
			var lastFingerprint = getLocationFingerprint(startLoc);

			function walk() {
				if (token !== reader._globalPageMapBuildToken) return Promise.resolve(Math.max(1, pages));
				guard += 1;
				if (guard > 12000) return Promise.resolve(Math.max(1, pages));

				return waitForResponsiveSlot().then(function () {
					return reader._pageCalcRendition.next();
				}).then(function () {
					if (token !== reader._globalPageMapBuildToken) return Math.max(1, pages);

					var loc = reader._pageCalcRendition.currentLocation ? reader._pageCalcRendition.currentLocation() : null;
					if (!loc || !loc.start) return Math.max(1, pages);

					var fp = getLocationFingerprint(loc);
					if (!fp || fp === lastFingerprint) return Math.max(1, pages);

					var idx = getSpineIndexFromLocation(loc);
					if (idx >= 0 && idx !== activeSectionIndex) return Math.max(1, pages);
					var hrefNow = normalizeHref(loc && loc.start && loc.start.href ? loc.start.href : "");
					if (activeHref && hrefNow && hrefNow !== activeHref) return Math.max(1, pages);

					lastFingerprint = fp;
					pages += 1;
					if ((pages % 3) === 0) {
						return waitForResponsiveSlot().then(function () { return walk(); });
					}
					return walk();
				}).catch(function () {
					return Math.max(1, pages);
				});
			}

			return walk();
		}).catch(function () {
			return 1;
		});
	}

	function buildSectionTotalsQuick(items, token) {
		var sectionTotals = new Array(items.length);
		var index = 0;
		function step() {
			if (token !== reader._globalPageMapBuildToken) return Promise.resolve(sectionTotals);
			if (index >= items.length) return Promise.resolve(sectionTotals);
			var item = items[index];
			if (!isSpineItemLinear(item)) {
				sectionTotals[index] = 0;
				index += 1;
				return step();
			}
			return countSectionPagesQuick(item, token).then(function (count) {
				var parsed = parseInt(count, 10);
				if (!parsed || isNaN(parsed) || parsed < 1) parsed = 1;
				sectionTotals[index] = parsed;
			}).catch(function () {
				sectionTotals[index] = 1;
			}).then(function () {
				index += 1;
				if ((index % 5) === 0) {
					return waitForResponsiveSlot().then(function () { return step(); });
				}
				return step();
			});
		}
		return step();
	}

	function buildSectionTotalsExact(items, token) {
		var sectionTotals = new Array(items.length);
		var index = 0;
		function step() {
			if (token !== reader._globalPageMapBuildToken) return Promise.resolve(sectionTotals);
			if (index >= items.length) return Promise.resolve(sectionTotals);
			var item = items[index];
			if (!isSpineItemLinear(item)) {
				sectionTotals[index] = 0;
				index += 1;
				return waitForResponsiveSlot().then(function () { return step(); });
			}
			return waitForResponsiveSlot().then(function () {
				return countSectionPages(item, index, token);
			}).then(function (count) {
				var parsed = parseInt(count, 10);
				if (!parsed || isNaN(parsed) || parsed < 1) parsed = 1;
				sectionTotals[index] = parsed;
			}).catch(function () {
				sectionTotals[index] = 1;
			}).then(function () {
				index += 1;
				return waitForResponsiveSlot().then(function () { return step(); });
			});
		}
		return waitForResponsiveSlot().then(function () { return step(); });
	}

	function maybeLaunchExactRefinement(key, items, token) {
		// Disabled for now: exact pass can produce unstable jumps on real devices.
		// Keep quick-pass totals only (deterministic and fast across desktop/mobile).
		return;
		if (reader._globalPageMapExactCache[key]) return;
		if (reader._globalPageMapExactBuilding && reader._globalPageMapExactKey === key) return;

		reader._globalPageMapExactBuilding = true;
		reader._globalPageMapExactKey = key;

		buildSectionTotalsExact(items, token).then(function (exactTotals) {
			if (token !== reader._globalPageMapBuildToken) return;
			var exactMap = createPageMapFromSectionTotals(key, exactTotals, true);
			reader._globalPageMapExactCache[key] = clonePageMap(exactMap);

			var currentMap = reader._globalPageMap || null;
			var shouldApply = !currentMap || !currentMap.ready || currentMap.key !== key || !pageMapsEqual(currentMap, exactMap) || !currentMap.isExact;
			if (shouldApply) applyGlobalPageMap(exactMap, false);
		}).finally(function () {
			reader._globalPageMapExactBuilding = false;
			reader._globalPageMapExactKey = "";
		});
	}

	function buildGlobalPageMap(force) {
		if (!reader.book || !reader.book.spine || !reader.rendition) {
			if (reader._pageCounterPending) setPageCounterPending(false);
			return Promise.resolve();
		}

		var key = getPageLayoutKey();
		var currentMap = reader._globalPageMap || {};
		// When force=true (font/resize rebuild), ignore cached totals to guarantee a real recount.
		var exactCached = (!force) ? clonePageMap(reader._globalPageMapExactCache[key]) : null;
		if (exactCached) {
			applyGlobalPageMap(exactCached, true);
			return Promise.resolve();
		}

		if (!force && currentMap.ready && currentMap.key === key && currentMap.totalPages > 0) {
			if (reader._pageCounterPending) {
				setPageCounterPending(false);
				var locStable = reader._lastRelocated || (reader.rendition.currentLocation ? reader.rendition.currentLocation() : null);
				if (locStable) updatePageCount(locStable);
			}
			return Promise.resolve();
		}

		if (reader._globalPageMapBuilding) {
			reader._globalPageMapQueued = true;
			reader._globalPageMapQueuedForce = !!(reader._globalPageMapQueuedForce || force);
			return Promise.resolve();
		}

		reader._globalPageMapBuilding = true;
		var token = ++reader._globalPageMapBuildToken;
		setPageCounterPending(true);
		var finalized = false;

		function clearBuildWatchdog() {
			try {
				if (reader._globalPageMapBuildWatchdog) {
					clearTimeout(reader._globalPageMapBuildWatchdog);
					reader._globalPageMapBuildWatchdog = null;
				}
			} catch (eWdClear) {}
		}

		ensureSpineHrefIndex();
		ensurePageCalcRendition(!!force);

		var items = (reader.book && reader.book.spine && reader.book.spine.spineItems) ? reader.book.spine.spineItems : [];
		var useExactNow = isJsonManifestBook();

		function finalizeQuickPhase() {
			if (finalized) return;
			finalized = true;
			clearBuildWatchdog();
			reader._globalPageMapBuilding = false;
			if (reader._globalPageMapQueued) {
				var qForce = !!reader._globalPageMapQueuedForce;
				reader._globalPageMapQueued = false;
				reader._globalPageMapQueuedForce = false;
				setTimeout(function () { buildGlobalPageMap(qForce); }, 0);
			}
		}
		try {
			reader._globalPageMapBuildWatchdog = setTimeout(function () {
				if (token !== reader._globalPageMapBuildToken) return;
				if (!reader._globalPageMapBuilding) return;
				setPageCounterPending(false);
				try {
					var locNow = reader._lastRelocated || (reader.rendition.currentLocation ? reader.rendition.currentLocation() : null);
					if (locNow) updatePageCount(locNow);
				} catch (eWdUpdate) {}
				finalizeQuickPhase();
			}, 9000);
		} catch (eWd) {}

		var quickCached = (!force) ? clonePageMap(reader._globalPageMapQuickCache[key]) : null;
		var quickPromise;
		if (useExactNow) {
			quickPromise = buildSectionTotalsExact(items, token).then(function (exactTotalsNow) {
				if (token !== reader._globalPageMapBuildToken) return null;
				var exactNowMap = createPageMapFromSectionTotals(key, exactTotalsNow, true);
				reader._globalPageMapExactCache[key] = clonePageMap(exactNowMap);
				return exactNowMap;
			});
		} else {
			quickPromise = quickCached
				? Promise.resolve(quickCached)
				: buildSectionTotalsQuick(items, token).then(function (quickTotals) {
					if (token !== reader._globalPageMapBuildToken) return null;
					var quickMap = createPageMapFromSectionTotals(key, quickTotals, false);
					reader._globalPageMapQuickCache[key] = clonePageMap(quickMap);
					return quickMap;
				});
		}

		return quickPromise.then(function (quickMap) {
			if (!quickMap || token !== reader._globalPageMapBuildToken) return;
			applyGlobalPageMap(quickMap, true);
			if (!useExactNow) maybeLaunchExactRefinement(key, items, token);
		}).catch(function () {
			if (token === reader._globalPageMapBuildToken) setPageCounterPending(false);
		}).finally(function () {
			finalizeQuickPhase();
		});
	}

	function scheduleGlobalPageMapRebuild(reason, force) {
		// Coalesce rapid resize/font events without losing "force=true".
		// If any event in the burst requires force, the scheduled build must stay forced.
		var nextForce = !!force;
		if (reader._globalPageMapTimerForce) nextForce = true;
		if (reader._globalPageMapTimer) {
			try { clearTimeout(reader._globalPageMapTimer); } catch (e0) {}
		}
		reader._globalPageMapTimerForce = nextForce;
		reader._globalPageMapTimer = setTimeout(function () {
			reader._globalPageMapTimer = null;
			var runForce = !!reader._globalPageMapTimerForce;
			reader._globalPageMapTimerForce = false;
			buildGlobalPageMap(runForce);
		}, 280);
	}

	reader.__scheduleGlobalPageMapRebuild = scheduleGlobalPageMapRebuild;

	function isUiToggleResizeNoise(reason) {
		try {
			if (reason !== "resize" && reason !== "visual-viewport-resize" && reason !== "viewer-resize-observer") {
				return false;
			}
			var topWin = (window && window.top) ? window.top : window;
			var ts = 0;
			try { ts = topWin.__fbUiLastToggleTs || 0; } catch (eTopTs) {}
			if (!ts) {
				try { ts = window.__fbUiLastToggleTs || 0; } catch (eWinTs) {}
			}
			if (!ts) return false;
			return (Date.now() - ts) < 950;
		} catch (e) {}
		return false;
	}

	function isIosResizeNoiseContext() {
		try {
			var ua = navigator.userAgent || "";
			var iOS = /iP(ad|hone|od)/i.test(ua);
			var iPadOS = /Macintosh/i.test(ua) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1;
			return !!(iOS || iPadOS);
		} catch (e) {}
		return false;
	}

	function isIphoneSearchKeyboardResizeNoise(reason) {
		try {
			if (reason !== "resize" && reason !== "visual-viewport-resize" && reason !== "viewer-resize-observer") {
				return false;
			}
			var ua = navigator.userAgent || "";
			if (!/iPhone/i.test(ua)) return false;
			var topWin = (window && window.top) ? window.top : window;
			var suppress = false;
			try { suppress = !!topWin.__fbSuppressIosViewportReflow; } catch (e0) {}
			if (!suppress) {
				try { suppress = !!window.__fbSuppressIosViewportReflow; } catch (e1) {}
			}
			if (suppress) return true;
			var body = document.body || null;
			if (
				body &&
				body.classList &&
				body.classList.contains("search-open") &&
				!body.classList.contains("search-minimized")
			) return true;
		} catch (e) {}
		return false;
	}

	function isPassiveResizeReason(reason) {
		if (reason === "visual-viewport-resize") return true;
		if (reason === "viewer-resize-observer") return isIosResizeNoiseContext();
		if (reason === "resize" && isIosResizeNoiseContext()) return true;
		return false;
	}

	function scheduleLayoutReflowAndPageRebuild(reason, forceRebuild) {
		if (isUiToggleResizeNoise(reason)) {
			return;
		}
		if (isIphoneSearchKeyboardResizeNoise(reason)) {
			return;
		}
		var passiveResize = isPassiveResizeReason(reason);
		var rebuildForce = passiveResize ? false : !!forceRebuild;
		if (!passiveResize) {
			setPageCounterPending(true);
		}
		try {
			if (reader._layoutReflowTimer) clearTimeout(reader._layoutReflowTimer);
		} catch (e0) {}
		reader._layoutReflowTimer = setTimeout(function () {
			reader._layoutReflowTimer = null;
			try { applyReaderNewCompatGapMetrics(); } catch (eCompat) {}
			try { if (reader.rendition && reader.rendition.resize) reader.rendition.resize(); } catch (e1) {}
			try { if (reader.renditionPrev && reader.renditionPrev.resize) reader.renditionPrev.resize(); } catch (e2) {}
			try { if (reader.renditionNext && reader.renditionNext.resize) reader.renditionNext.resize(); } catch (e3) {}
			scheduleGlobalPageMapRebuild(reason || "layout", rebuildForce);
		}, 140);
	}

	function updatePageCount(loc) {
		if (!pageCountEl) return;
		if (!loc) loc = getCurrentLocationSafe();
		if (!loc) {
			try {
				if (!String(pageCountEl.textContent || "").trim()) renderPageCountLabel("…/…");
			} catch (eEmpty) {}
			return;
		}
		try {
			if (reader._pageCounterPending) {
				try {
					var pendingSince = parseInt(reader._pageCounterPendingSince || 0, 10) || 0;
					var pendingTooLong = pendingSince > 0 && ((Date.now() - pendingSince) > 7000);
					var mapReady = !!(reader._globalPageMap && reader._globalPageMap.ready && reader._globalPageMap.totalPages);
					if (pendingTooLong || mapReady) {
						setPageCounterPending(false);
					}
				} catch (ePendingGuard) {}
			}
			if (reader._pageCounterPending) {
				var pendingFallback = getGlobalPageFromLocationsFallback(loc);
				if (pendingFallback && pendingFallback.total) {
					var pendingLabel = String(pendingFallback.page) + "/" + String(pendingFallback.total);
					var pendingTitle = getTocTitleForLocation(loc);
					renderPageCountLabel(buildFittedPageCounterLabel(pendingLabel, pendingTitle));
				} else {
					renderPageCountLabel("…/…");
				}
				return;
			}
			var p = getGlobalPageFromLocation(loc);
			if (!p || !p.total) {
				p = getGlobalPageFromLocationsFallback(loc);
				if (!p || !p.total) {
					renderPageCountLabel("…/…");
					return;
				}
			}
			if (loc && loc.atEnd) p.page = p.total;
			if (loc && loc.atStart) p.page = 1;
			var tocTitle = getTocTitleForLocation(loc);
			var pageLabel = String(p.page) + "/" + String(p.total);
			var fullLabel = buildFittedPageCounterLabel(pageLabel, tocTitle);
			renderPageCountLabel(fullLabel);
			reader._lastStablePageCounterText = fullLabel;
		} catch (e) {}
	}

	// Generate locations map for swipe neighbors and build global page map for footer.
	book.ready.then(function(){ return generateLocationsOnce(); })
		.then(function(){ return buildGlobalPageMap(true); });

	window.addEventListener("resize", function () {
		scheduleLayoutReflowAndPageRebuild("resize", true);
	}, { passive: true });
	window.addEventListener("pointerdown", markReaderInteraction, { passive: true });
	window.addEventListener("touchstart", markReaderInteraction, { passive: true });
	window.addEventListener("keydown", markReaderInteraction, { passive: true });
	window.addEventListener("wheel", markReaderInteraction, { passive: true });
	window.addEventListener("orientationchange", function () {
		scheduleLayoutReflowAndPageRebuild("orientation", true);
	}, { passive: true });
	try {
		if (window.visualViewport && window.visualViewport.addEventListener) {
			window.visualViewport.addEventListener("resize", function () {
				scheduleLayoutReflowAndPageRebuild("visual-viewport-resize", true);
			}, { passive: true });
		}
	} catch (eVvResize) {}
	try {
		if (window.ResizeObserver) {
			var pageResizeTarget = document.getElementById("viewerStack") || document.getElementById("viewer");
			if (pageResizeTarget) {
				var lastW = 0;
				var lastH = 0;
				var ro = new ResizeObserver(function (entries) {
					if (!entries || !entries.length) return;
					var rect = entries[0].contentRect || {};
					var w = Math.round(rect.width || 0);
					var h = Math.round(rect.height || 0);
					if (w < 1 || h < 1) return;
					if (w === lastW && h === lastH) return;
					lastW = w;
					lastH = h;
					scheduleLayoutReflowAndPageRebuild("viewer-resize-observer", true);
				});
				ro.observe(pageResizeTarget);
			}
		}
	} catch (eRo) {}
	// -----------------------------
	// Font size menu UI (single "A" button + 5-step scale)
	// -----------------------------
	// -----------------------------
	// Font size buttons (A larger / A smaller)
	// Range: -20% .. +60% (80%..160%), step 5%
	// Start: 0% (100%)
	// -----------------------------
	(function setupFontButtons() {
		var inc = document.getElementById("fontInc");
		var dec = document.getElementById("fontDec");
		if (!inc || !dec) return;

		function clamp(v) { return Math.max(80, Math.min(160, v)); }
		function current() {
			try { return getUiFontPct(); } catch (e) { return 100; }
		}
		function apply(delta) {
			var v = clamp(current() + delta);
			setFontPct(v);
		}

		inc.addEventListener("click", function(ev){ ev.preventDefault(); apply(5); }, false);
		dec.addEventListener("click", function(ev){ ev.preventDefault(); apply(-5); }, false);
	})();

	var saveLocTimer = null;
	function scheduleSaveLocation() {
		try {
			if (!reader.settings || !reader.settings.restore) return;
			if (!localStorage) return;
		} catch (e0) { return; }
		if (saveLocTimer) {
			try { clearTimeout(saveLocTimer); } catch (e1) {}
		}
		saveLocTimer = setTimeout(function () {
			saveLocTimer = null;
			try { reader.saveSettings(); } catch (e2) {}
		}, 200);
	}
;

	this.rendition.on("relocated", function (location) {
		try { reader._lastRelocated = location; } catch (e) {}
		try { reader._navInProgressUntil = 0; } catch (eNavDone) {}
		updatePageCount(location);
		schedulePageCounterRecovery("relocated");
		try {
			if (reader._swipeAnimating) {
				reader._pendingSwipeNeighborLocation = location;
			} else if (reader.__updateSwipeNeighbors) {
				reader.__updateSwipeNeighbors(location);
			}
		} catch (e2) {}
		scheduleSaveLocation();
	});

	try {
		document.addEventListener("visibilitychange", function () {
			if (document.visibilityState === "visible") schedulePageCounterRecovery("visible");
		}, { passive: true });
		window.addEventListener("pageshow", function () { schedulePageCounterRecovery("pageshow"); }, { passive: true });
	} catch (eVis) {}

	if(this.settings.previousLocationCfi) {
		try { markNavigationInProgress(2200); } catch (eNavInit1) {}
		this.displayed = this.rendition.display(this.settings.previousLocationCfi);
	} else {
		try { markNavigationInProgress(2200); } catch (eNavInit2) {}
		this.displayed = this.rendition.display();
	}

	// Apply initial font size right after the first render.
	// (Settings store it, but it won't take effect until setStyle is called.)
	this.displayed.then(function () {
		if (reader.settings && reader.settings.styles && reader.settings.styles.fontSize) {
			if (reader.book && typeof reader.book.setStyle === "function") {
				reader.book.setStyle("fontSize", reader.settings.styles.fontSize);
			}
		}
	});

	book.ready.then(function () {
		reader.ReaderController = EPUBJS.reader.ReaderController.call(reader, book);
		reader.SettingsController = EPUBJS.reader.SettingsController.call(reader, book);
		reader.ControlsController = EPUBJS.reader.ControlsController.call(reader, book);
		reader.BookmarksController = EPUBJS.reader.BookmarksController.call(reader, book);
		reader.NotesController = EPUBJS.reader.NotesController.call(reader, book);

		window.addEventListener("hashchange", this.hashChanged.bind(this), false);
		document.addEventListener('keydown', this.adjustFontSize.bind(this), false);
		this.rendition.on("keydown", this.adjustFontSize.bind(this));
		this.rendition.on("keydown", reader.ReaderController.arrowKeys.bind(this));
		this.rendition.on("selected", this.selectedRange.bind(this));
	}.bind(this)).then(function() {
		reader.ReaderController.hideLoader();
	}.bind(this));

	// Call Plugins
	for(plugin in EPUBJS.reader.plugins) {
		if(EPUBJS.reader.plugins.hasOwnProperty(plugin)) {
			reader[plugin] = EPUBJS.reader.plugins[plugin].call(reader, book);
		}
	}

	book.loaded.metadata.then(function(meta) {
		reader.MetaController = EPUBJS.reader.MetaController.call(reader, meta);
	});

	book.loaded.navigation.then(function(navigation) {
		try {
			if (navigation && navigation.toc) buildTocMap(navigation.toc);
		} catch (e) {}
		reader.TocController = EPUBJS.reader.TocController.call(reader, navigation);
	});

	window.addEventListener("beforeunload", this.unload.bind(this), false);

	return this;
};

function applyReaderBookFontSize(readerInstance, value) {
	try {
		if (!readerInstance || !readerInstance.book || typeof readerInstance.book.setStyle !== "function") return false;
		readerInstance.book.setStyle("fontSize", value);
		return true;
	} catch (_styleError) {}
	return false;
}

EPUBJS.Reader.prototype.adjustFontSize = function(e) {
	var fontSize;
	var interval = 2;
	var PLUS = 187;
	var MINUS = 189;
	var ZERO = 48;
	var MOD = (e.ctrlKey || e.metaKey );

	if(!this.settings.styles) return;

	if(!this.settings.styles.fontSize) {
		this.settings.styles.fontSize = "100%";
	}

	fontSize = parseInt(this.settings.styles.fontSize.slice(0, -1));

	if(MOD && e.keyCode == PLUS) {
		e.preventDefault();
			var nextPlus = (fontSize + interval) + "%";
			applyReaderBookFontSize(this, nextPlus);
			this.settings.styles.fontSize = nextPlus;
			_applyUiScale(nextPlus);

	}

	if(MOD && e.keyCode == MINUS){

		e.preventDefault();
			var nextMinus = (fontSize - interval) + "%";
			applyReaderBookFontSize(this, nextMinus);
			this.settings.styles.fontSize = nextMinus;
			_applyUiScale(nextMinus);
	}

	if(MOD && e.keyCode == ZERO){
		e.preventDefault();
			applyReaderBookFontSize(this, "100%");
			this.settings.styles.fontSize = "100%";
			_applyUiScale("100%");
	}
};

EPUBJS.Reader.prototype.addBookmark = function(cfi) {
	var bm = null;
	if (typeof cfi === "string") {
		bm = { cfi: cfi };
	} else if (cfi && typeof cfi === "object" && cfi.cfi) {
		bm = cfi;
	}
	if (!bm || !bm.cfi) return;

	var present = this.isBookmarked(bm.cfi);
	if(present > -1 ) return;

	if (!bm.createdAt) bm.createdAt = Date.now();
	this.settings.bookmarks.push(bm);

	this.trigger("reader:bookmarked", bm);
};

EPUBJS.Reader.prototype.removeBookmark = function(cfi) {
	var key = (typeof cfi === "string") ? cfi : (cfi && cfi.cfi ? cfi.cfi : null);
	if (!key) return;
	var bookmark = this.isBookmarked(key);
	if( bookmark === -1 ) return;

	this.settings.bookmarks.splice(bookmark, 1);

	this.trigger("reader:unbookmarked", key);
};

EPUBJS.Reader.prototype.isBookmarked = function(cfi) {
	var bookmarks = this.settings.bookmarks;
	if (!bookmarks || !bookmarks.length) return -1;
	for (var i = 0; i < bookmarks.length; i++) {
		var bm = bookmarks[i];
		if (typeof bm === "string") {
			if (bm === cfi) return i;
		} else if (bm && bm.cfi === cfi) {
			return i;
		}
	}
	return -1;
};

/*
EPUBJS.Reader.prototype.searchBookmarked = function(cfi) {
	var bookmarks = this.settings.bookmarks,
			len = bookmarks.length,
			i;

	for(i = 0; i < len; i++) {
		if (bookmarks[i]['cfi'] === cfi) return i;
	}
	return -1;
};
*/

EPUBJS.Reader.prototype.clearBookmarks = function() {
	this.settings.bookmarks = [];
};

//-- Notes
EPUBJS.Reader.prototype.addNote = function(note) {
	this.settings.annotations.push(note);
};

EPUBJS.Reader.prototype.removeNote = function(note) {
	var index = this.settings.annotations.indexOf(note);
	if( index === -1 ) return;

	delete this.settings.annotations[index];

};

EPUBJS.Reader.prototype.clearNotes = function() {
	this.settings.annotations = [];
};

//-- Settings
EPUBJS.Reader.prototype.setBookKey = function(identifier){
	if(!this.settings.bookKey) {
		this.settings.bookKey = "epubjsreader:" + EPUBJS.VERSION + ":" + window.location.host + ":" + identifier;
	}
	return this.settings.bookKey;
};

//-- Checks if the book setting can be retrieved from localStorage
EPUBJS.Reader.prototype.isSaved = function(bookPath) {
	var storedSettings;

	if(!localStorage) {
		return false;
	}

	storedSettings = localStorage.getItem(this.settings.bookKey);

	if(storedSettings === null) {
		return false;
	} else {
		return true;
	}
};

EPUBJS.Reader.prototype.removeSavedSettings = function() {
	if(!localStorage) {
		return false;
	}

	localStorage.removeItem(this.settings.bookKey);
};

EPUBJS.Reader.prototype.applySavedSettings = function() {
		var stored;

		if(!localStorage) {
			return false;
		}

	try {
		stored = JSON.parse(localStorage.getItem(this.settings.bookKey));
	} catch (e) { // parsing error of localStorage
		return false;
	}

		if(stored) {
			// Merge styles
			if(stored.styles) {
				this.settings.styles = EPUBJS.core.defaults(this.settings.styles || {}, stored.styles);
			}
			// Merge the rest
			this.settings = EPUBJS.core.defaults(this.settings, stored);
			return true;
		} else {
			return false;
		}
};

EPUBJS.Reader.prototype.saveSettings = function(){
	if(this.book) {
		this.settings.previousLocationCfi = this.rendition.currentLocation().start.cfi;
	}

	if(!localStorage) {
		return false;
	}

	localStorage.setItem(this.settings.bookKey, JSON.stringify(this.settings));
};

EPUBJS.Reader.prototype.unload = function(){
	if(this.settings.restore && localStorage) {
		this.saveSettings();
	}
};


EPUBJS.Reader.prototype.hashChanged = function(){
	var hash = window.location.hash.slice(1);
	try { if (this.__markNavigationInProgress) this.__markNavigationInProgress(1600); } catch (e0) {}
	this.rendition.display(hash);
};

EPUBJS.Reader.prototype.selectedRange = function(cfiRange){
	try {
		if (window.__fb_isDesktop === false) return;
		if (window.__fbSelectionActive) return;
	} catch (e0) {}
	var cfiFragment = "#"+cfiRange;

	// Update the History Location
	if(this.settings.history &&
			window.location.hash != cfiFragment) {
		// Add CFI fragment to the history
		history.pushState({}, '', cfiFragment);
		this.currentLocationCfi = cfiRange;
	}
};

//-- Enable binding events to reader
RSVP.EventTarget.mixin(EPUBJS.Reader.prototype);

EPUBJS.reader.BookmarksController = function() {
	var reader = this;
	var book = this.book;
	var rendition = this.rendition;

	var $bookmarks = $("#bookmarksView"),
			$list = $bookmarks.find("#bookmarks");

	var show = function() {
		$bookmarks.show();
	};

	var hide = function() {
		$bookmarks.hide();
	};

	var counter = 0;

	// Safe array coercion (older saved settings may contain unexpected shapes)
	function bookmarksSafeList(bm) {
		if (!bm) return [];
		if (!Array.isArray(bm)) return [];
		var out = [];
		for (var i = 0; i < bm.length; i++) {
			var item = bm[i];
			if (typeof item === "string" && item.length) {
				out.push({ cfi: item });
			} else if (item && typeof item === "object" && item.cfi) {
				out.push(item);
			}
		}
		return out;
	}

	// Build a stable label for a bookmark:
	// - show the global page number (across the whole book)
	// - dynamically updates when locations are regenerated (resize, font size)
	function _bmNormalizeHref(href) {
		if (!href) return "";
		var h = String(href).split("#")[0];
		h = h.replace(/^\.\//, "");
		h = h.replace(/^\//, "");
		return h;
	}
	var createBookmarkItem = function(bm) {
		var listitem = document.createElement("li"),
				btn = document.createElement("button"),
				wrap = document.createElement("div");

		listitem.classList.add('list_item');
		listitem.setAttribute("data-cfi", bm.cfi);
		listitem.id = "bookmark-" + (counter++);

		function getBookmarkPageNumber(cfi) {
			try {
				if (window.__fbGetGlobalPageLabelForCfi) {
					var pageNo = String(window.__fbGetGlobalPageLabelForCfi(cfi) || "").trim();
					if (pageNo) return pageNo;
				}
			} catch (e0) {}
			return "";
		}

		function getBookmarkChapterTitle(cfi) {
			try {
				var item = reader.book.spine.get(cfi);
				var href = item && item.href ? _bmNormalizeHref(item.href) : "";
				if (href && reader._tocMap && reader._tocMap[href]) return String(reader._tocMap[href] || "").trim();
			} catch (e1) {}
			return "";
		}

		var pageLabel = getBookmarkPageNumber(bm.cfi) || "…";
		var chapterTitle = getBookmarkChapterTitle(bm.cfi);

		var pageMeta = document.createElement("div");
		pageMeta.className = "bookmark-page-label";
		pageMeta.textContent = pageLabel;
		wrap.appendChild(pageMeta);
		if (chapterTitle) {
			var chapterMeta = document.createElement("div");
			chapterMeta.className = "bookmark-comment";
			chapterMeta.textContent = chapterTitle;
			wrap.appendChild(chapterMeta);
		}

		wrap.className = "bookmark-text";
		wrap.classList.add('bookmark_link');
		wrap.setAttribute('data-cfi', bm.cfi);
		wrap.addEventListener("click", function(event){
			var cfi = this.getAttribute('data-cfi');
			if (!cfi) return;
			rendition.display(cfi);
			try {
				if (window.__fbCloseAndHideAfterNavigation) window.__fbCloseAndHideAfterNavigation();
				else if (window.__fbCloseOverlays) window.__fbCloseOverlays();
			} catch(e) {}
			event.preventDefault();
		}, false);
		if (bm && bm.comment) {
			var comment = document.createElement("div");
			comment.className = "bookmark-comment";
			comment.textContent = bm.comment;
			wrap.appendChild(comment);
		}
		listitem.appendChild(wrap);
		btn.type = "button";
		btn.className = "bookmark-delete";
		btn.setAttribute("aria-label", "Delete bookmark");
		btn.setAttribute("data-cfi", bm.cfi);
		btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
			+ '<path d="M4 7h16" />'
			+ '<path d="M9 7V5h6v2" />'
			+ '<rect x="6" y="7" width="12" height="13" rx="2" />'
			+ '<path d="M10 11v6" />'
			+ '<path d="M14 11v6" />'
			+ '</svg>';
		btn.addEventListener("click", function(event){
			event.preventDefault();
			event.stopPropagation();
			var cfi = this.getAttribute("data-cfi");
			if (cfi) reader.removeBookmark(cfi);
		}, false);
		listitem.appendChild(btn);
		return listitem;
	};

	// Initial render
	$list.empty();
	bookmarksSafeList(reader.settings.bookmarks).forEach(function(bm) {
		$list.append(createBookmarkItem(bm));
	});

	// Live updates
	this.on("reader:bookmarked", function(bm) {
		$list.append(createBookmarkItem(bm));
	});

	// When global locations mapping changes (resize), refresh labels
	this.on("reader:locationsChanged", function() {
		refresh();
	});

	this.on("reader:unbookmarked", function(cfi) {
		// Remove first matching <li data-cfi="...">
		var children = $list.children("li");
		for (var i = 0; i < children.length; i++) {
			if (children[i].getAttribute("data-cfi") === cfi) {
				children[i].remove();
				break;
			}
		}
	});

	function refresh() {
		// Re-render list with updated labels
		$list.empty();
		bookmarksSafeList(reader.settings.bookmarks).forEach(function(bm) {
			$list.append(createBookmarkItem(bm));
		});
	}

	return {
		"show" : show,
		"hide" : hide,
		"refresh": refresh
	};
};

EPUBJS.reader.ControlsController = function(book) {
	var reader = this;
	var rendition = this.rendition;

	var $store = $("#store"),
			$fullscreen = $("#fullscreen"),
			$fullscreenicon = $("#fullscreenicon"),
			$cancelfullscreenicon = $("#cancelfullscreenicon"),
			$slider = $("#slider"),
			$main = $("#main"),
			$sidebar = $("#sidebar"),
			$settings = $("#setting"),
			$bookmark = $("#bookmark"),
			$addressBarToggle = $("#addressBarToggle");
	/*
	var goOnline = function() {
		reader.offline = false;
		// $store.attr("src", $icon.data("save"));
	};

	var goOffline = function() {
		reader.offline = true;
		// $store.attr("src", $icon.data("saved"));
	};

	var fullscreen = false;

	book.on("book:online", goOnline);
	book.on("book:offline", goOffline);
	*/
	// Sidebar removed: hamburger is handled by fbreader-ui.js overlays


// Fullscreen: native where supported; fallback for iOS Safari where fullscreen is not available.
// IMPORTANT: the fallback must NOT hide the reader header/footer. It only nudges scroll position
// to collapse/restore the browser UI (address bar) as much as the browser allows.
var isPseudoFullscreen = false; // used only for the non-Fullscreen fallback toggle state
var addressBarHidden = false;
var addressBarBaseline = 0;
var addressBarBaselineW = 0;
var fullEl = document.getElementById("container") || document.documentElement;

function _nativeRequestFullscreen(el){
	if(!el) el = document.documentElement;
	var req = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen || el.mozRequestFullScreen || el.msRequestFullscreen;
	if(req) {
		try { req.call(el); return true; } catch(e){ return false; }
	}
	return false;
}
function _nativeExitFullscreen(){
	var exit = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen || document.mozCancelFullScreen || document.msExitFullscreen;
	if(exit) {
		try { exit.call(document); return true; } catch(e){ return false; }
	}
	return false;
}

// Auto-enter fullscreen on the FIRST user gesture (mobile). Browsers require a user action.
// We hook at the top document level, so it works for Android Chrome.
// NOTE: If fullscreen is not permitted, this silently does nothing.
(function(){
  try {
    if (typeof window !== "undefined" && typeof window.__fb_disable_auto_fullscreen === "undefined") {
      window.__fb_disable_auto_fullscreen = true;
    }
  } catch (e0) {}
})();
(function(){
  // Desktop must never enter fullscreen and must always keep bars visible.
  // We treat "desktop" as pointer+hover capable layouts.
  if (window.__fb_no_fullscreen__) return;
  if (window.__fb_disable_auto_fullscreen) return;
  try {
    if (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  } catch(e) {}

  var attempted = false;
  var lastTry = 0;
	function isFs(){
		return !!(document.fullscreenElement || document.webkitFullscreenElement || document.webkitCurrentFullScreenElement);
	}
	function tryFs(){
    if (isFs()) return;
    var now = Date.now();
    if (attempted && (now - lastTry) < 1200) return;
    attempted = true;
    lastTry = now;
		try {
      _nativeRequestFullscreen(fullEl);
		} catch(e) {}
	}
  // If the user backgrounded the browser/app, we must allow fullscreen again.
  document.addEventListener("visibilitychange", function(){
    if (!document.hidden) { attempted = false; lastTry = 0; }
  });
  window.addEventListener("focus", function(){ attempted = false; lastTry = 0; });

  // Capture so we run within the user gesture as early as possible.
  document.addEventListener("touchstart", function(){ tryFs(); }, {capture:true, passive:true});
  document.addEventListener("touchend", function(){ tryFs(); }, {capture:true, passive:true});
  document.addEventListener("pointerdown", function(){ tryFs(); }, {capture:true});
  document.addEventListener("click", function(){ tryFs(); }, {capture:true});
})();
function _nativeIsFullscreen(){
	return !!(document.fullscreenElement || document.webkitFullscreenElement || document.webkitCurrentFullScreenElement || document.mozFullScreenElement || document.msFullscreenElement);
}
function _updateFsIcon(isFs){
	if(isFs){
		$fullscreen.addClass("active");
		$fullscreen.attr("aria-pressed","true");
		$fullscreen.find(".icon").removeClass("icon-resize-full").addClass("icon-resize-small");
	} else {
		$fullscreen.removeClass("active");
		$fullscreen.attr("aria-pressed","false");
		$fullscreen.find(".icon").removeClass("icon-resize-small").addClass("icon-resize-full");
	}
}
function _toggleAddressBarNudge(){
	isPseudoFullscreen = !isPseudoFullscreen;
	_updateFsIcon(isPseudoFullscreen);
	// iOS Safari: scrolling by 1px may collapse the address bar; scrolling back to 0 tends to restore it.
	// This is best-effort and browser-controlled.
	setTimeout(function(){
		try { window.scrollTo(0, isPseudoFullscreen ? 1 : 0); } catch(e){}
	}, 0);
}

function _nudgeAddressBarNow(){
  // Only meaningful on touch/mobile browsers
  try {
    if (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  } catch(e) {}
  try {
    var docEl = document.documentElement;
    var body = document.body;
    var h = (window.innerHeight || (docEl && docEl.clientHeight) || (body && body.clientHeight) || 0);
    var prev = {
      docOverflow: docEl && docEl.style ? docEl.style.overflow : "",
      bodyOverflow: body && body.style ? body.style.overflow : "",
      docHeight: docEl && docEl.style ? docEl.style.height : "",
      bodyMinHeight: body && body.style ? body.style.minHeight : ""
    };
    var spacer = null;
    try {
      spacer = document.createElement("div");
      spacer.setAttribute("aria-hidden", "true");
      spacer.style.cssText = "position:absolute;left:0;top:0;width:1px;height:2px;opacity:0;";
      if (body) body.appendChild(spacer);
    } catch(e1) {}
    if (docEl && docEl.style) {
      docEl.style.overflow = "auto";
      if (h) docEl.style.height = (h + 2) + "px";
    }
    if (body && body.style) {
      body.style.overflow = "auto";
      if (h) body.style.minHeight = (h + 2) + "px";
    }
    var doScroll = function(){
      try { window.scrollTo(0, 1); } catch(e2){}
      try { if (docEl) docEl.scrollTop = 1; } catch(e3){}
      try { if (body) body.scrollTop = 1; } catch(e4){}
    };
    doScroll();
    setTimeout(doScroll, 50);
    setTimeout(function(){
      try { if (spacer && spacer.parentNode) spacer.parentNode.removeChild(spacer); } catch(e5){}
      try { if (docEl && docEl.style) { docEl.style.overflow = prev.docOverflow; docEl.style.height = prev.docHeight; } } catch(e6){}
      try { if (body && body.style) { body.style.overflow = prev.bodyOverflow; body.style.minHeight = prev.bodyMinHeight; } } catch(e7){}
    }, 250);
  } catch(e) {}
}

function _isIOS(){
	try {
		var ua = (navigator && navigator.userAgent) ? navigator.userAgent : "";
		var iOS = /iP(ad|hone|od)/i.test(ua);
		var iPadOS = /Macintosh/i.test(ua) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1;
		return iOS || iPadOS;
	} catch(e) {
		return false;
	}
}

function _updateAddressBarIcon(hidden){
	if (!$addressBarToggle || !$addressBarToggle.length) return;
	$addressBarToggle.removeClass("icon-resize-full icon-resize-small icon-resize-full-1");
	var $abFull = $addressBarToggle.find(".ab-icon-full");
	var $abSmall = $addressBarToggle.find(".ab-icon-small");
	if (hidden) {
		$addressBarToggle
			.addClass("ab-state-small")
			.removeClass("ab-state-full")
			.removeClass("hidden")
			.attr("aria-label", "Exit fullscreen")
			.attr("title", "Exit fullscreen");
		if ($abFull && $abFull.length) $abFull.css("display", "none");
		if ($abSmall && $abSmall.length) $abSmall.css("display", "block");
	} else {
		$addressBarToggle
			.addClass("ab-state-full")
			.removeClass("ab-state-small")
			.removeClass("hidden")
			.attr("aria-label", "Enter fullscreen")
			.attr("title", "Enter fullscreen");
		if ($abFull && $abFull.length) $abFull.css("display", "block");
		if ($abSmall && $abSmall.length) $abSmall.css("display", "none");
	}
}

function _getViewportHeight(){
	return (window.visualViewport && window.visualViewport.height) ||
		window.innerHeight ||
		(document.documentElement && document.documentElement.clientHeight) ||
		0;
}

function _maybeResetAddressBarBaseline(){
	var w = window.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 0;
	if (!addressBarBaseline || !addressBarBaselineW || Math.abs(w - addressBarBaselineW) > 50) {
		addressBarBaseline = _getViewportHeight();
		addressBarBaselineW = w;
	}
}

function _syncAddressBarIconState(){
	_maybeResetAddressBarBaseline();
	var h = _getViewportHeight();
	// Track the smallest height seen; that's most likely "address bar visible".
	if (h && addressBarBaseline) {
		addressBarBaseline = Math.min(addressBarBaseline, h);
	}
	var delta = h - addressBarBaseline;
	var hiddenNow = _nativeIsFullscreen() || (delta > 40); // fullscreen or collapsed browser UI
	if (hiddenNow !== addressBarHidden) {
		addressBarHidden = hiddenNow;
		_updateAddressBarIcon(addressBarHidden);
	}
}

function _toggleAddressBar(){
	// If native fullscreen is active, this click must return to normal mode.
	if (_nativeIsFullscreen()) {
		_nativeExitFullscreen();
		setTimeout(function(){
			addressBarHidden = false;
			_updateAddressBarIcon(false);
		}, 60);
		return;
	}
	// If browser UI is already collapsed (pseudo-fullscreen), try restoring first.
	if (addressBarHidden) {
		try { window.scrollTo(0, 0); } catch(e0) {}
		setTimeout(_syncAddressBarIconState, 80);
		setTimeout(_syncAddressBarIconState, 240);
		return;
	}
	_nudgeAddressBarNow();
	setTimeout(_syncAddressBarIconState, 100);
	setTimeout(_syncAddressBarIconState, 250);
	// If nudge didn't collapse the address bar, fall back to fullscreen on explicit user click.
	setTimeout(function(){
		try {
			if (addressBarHidden) return;
			if (_nativeIsFullscreen()) return;
			_nativeRequestFullscreen(fullEl);
		} catch(e) {}
	}, 320);
}

$fullscreen.on("click", function(){
	// Prefer screenfull if available and enabled
	if(typeof screenfull !== 'undefined' && screenfull && screenfull.isEnabled){
		screenfull.toggle(fullEl);
		return;
	}
	// Try native fullscreen (some iPadOS / desktop Safari builds)
	if(_nativeIsFullscreen()){
		if(!_nativeExitFullscreen()) _toggleAddressBarNudge();
		return;
	}
	var ok = _nativeRequestFullscreen(fullEl);
	if(!ok) _toggleAddressBarNudge();
});

if ($addressBarToggle && $addressBarToggle.length) {
	if (_isIOS()) {
		$addressBarToggle.addClass("hidden");
	} else {
		_updateAddressBarIcon(addressBarHidden);
		$addressBarToggle.on("click", function(){
			_toggleAddressBar();
		});
		window.addEventListener("scroll", _syncAddressBarIconState, {passive:true});
		window.addEventListener("resize", _syncAddressBarIconState);
		if (window.visualViewport && window.visualViewport.addEventListener) {
			window.visualViewport.addEventListener("resize", _syncAddressBarIconState);
			window.visualViewport.addEventListener("scroll", _syncAddressBarIconState);
		}
		_syncAddressBarIconState();
	}
}

// Update icon on native fullscreen changes
["fullscreenchange","webkitfullscreenchange","mozfullscreenchange","MSFullscreenChange"].forEach(function(evt){
	document.addEventListener(evt, function(){
		var inFs = _nativeIsFullscreen();
		try {
			if (inFs) {
				if (typeof window.__fb_closeMobileMore === "function") window.__fb_closeMobileMore();
				if (typeof window.__fbHideUi === "function") window.__fbHideUi();
				else if (document.body && document.body.classList) document.body.classList.add("ui-hidden");
			} else {
				if (typeof window.__fbShowUi === "function") window.__fbShowUi();
				else if (document.body && document.body.classList) document.body.classList.remove("ui-hidden");
			}
		} catch (eUiFs) {}
		if(isPseudoFullscreen) return;
		_updateFsIcon(inFs);
	});
});


	$settings.on("click", function() {
		reader.SettingsController.show();
	});

	$bookmark.on("click", function() {
		var cfi = reader.rendition.currentLocation().start.cfi;
		var bookmarked = reader.isBookmarked(cfi);

		if(bookmarked === -1) { //-- Add bookmark
			reader.addBookmark(cfi);
			$bookmark
				.addClass("icon-bookmark")
				.removeClass("icon-bookmark-empty");
		} else { //-- Remove Bookmark
			reader.removeBookmark(cfi);
			$bookmark
				.removeClass("icon-bookmark")
				.addClass("icon-bookmark-empty");
		}

	});

	rendition.on('relocated', function(location){
		var cfi = location.start.cfi;
		var cfiFragment = "#" + cfi;
		//-- Check if bookmarked
		var bookmarked = reader.isBookmarked(cfi);
		if(bookmarked === -1) { //-- Not bookmarked
			$bookmark
				.removeClass("icon-bookmark")
				.addClass("icon-bookmark-empty");
		} else { //-- Bookmarked
			$bookmark
				.addClass("icon-bookmark")
				.removeClass("icon-bookmark-empty");
		}

		reader.currentLocationCfi = cfi;

		// Update the History Location
		if(reader.settings.history &&
				window.location.hash != cfiFragment) {
			// Add CFI fragment to the history
			history.pushState({}, '', cfiFragment);
		}
	});

	return {

	};
};

EPUBJS.reader.MetaController = function(meta) {
	var title = meta.title,
			author = meta.creator;

	var $title = $("#book-title"),
			$author = $("#chapter-title"),
			$dash = $("#title-seperator");

		document.title = title+" – "+author;

		$title.html(title);
		$author.html(author);
		$dash.show();

		try {
			if (window.__fbMyBooks && typeof window.__fbMyBooks.addFromMeta === "function") {
				window.__fbMyBooks.addFromMeta(title, author);
			}
		} catch (e) {}

		try {
			if (window.__fbUpdateMenuBookMeta) {
				window.__fbUpdateMenuBookMeta({
					title: title || "",
					author: author || ""
				});
			}
		} catch (e2) {}

		try {
			var activeReader = window.reader;
			var activeBook = activeReader && activeReader.book ? activeReader.book : null;
			if (activeBook && typeof activeBook.coverUrl === "function") {
				activeBook.coverUrl().then(function (coverUrl) {
					try {
						if (window.__fbUpdateMenuBookMeta && coverUrl) {
							window.__fbUpdateMenuBookMeta({
								title: title || "",
								author: author || "",
								cover: coverUrl
							});
						}
					} catch (e3) {}
				}).catch(function () {});
			}
		} catch (e4) {}
};

EPUBJS.reader.NotesController = function() {
	var book = this.book;
	var rendition = this.rendition;
	var reader = this;
	var $notesView = $("#notesView");
	var $notes = $("#notes");
	var $text = $("#note-text");
	var $anchor = $("#note-anchor");
	var annotations = reader.settings.annotations;
	var renderer = book.renderer;
	var popups = [];
	var epubcfi = new ePub.CFI();

	var show = function() {
		$notesView.show();
	};

	var hide = function() {
		$notesView.hide();
	}

	var insertAtPoint = function(e) {
		var range;
		var textNode;
		var offset;
		var doc = book.renderer.doc;
		var cfi;
		var annotation;

		// standard
		if (doc.caretPositionFromPoint) {
			range = doc.caretPositionFromPoint(e.clientX, e.clientY);
			textNode = range.offsetNode;
			offset = range.offset;
		// WebKit
		} else if (doc.caretRangeFromPoint) {
			range = doc.caretRangeFromPoint(e.clientX, e.clientY);
			textNode = range.startContainer;
			offset = range.startOffset;
		}

		if (textNode.nodeType !== 3) {
			for (var i=0; i < textNode.childNodes.length; i++) {
				if (textNode.childNodes[i].nodeType == 3) {
					textNode = textNode.childNodes[i];
					break;
				}
			}
			}

		// Find the end of the sentance
		offset = textNode.textContent.indexOf(".", offset);
		if(offset === -1){
			offset = textNode.length; // Last item
		} else {
			offset += 1; // After the period
		}

		cfi = epubcfi.generateCfiFromTextNode(textNode, offset, book.renderer.currentChapter.cfiBase);

		annotation = {
			annotatedAt: new Date(),
			anchor: cfi,
			body: $text.val()
		}

		// add to list
		reader.addNote(annotation);

		// attach
		addAnnotation(annotation);
		placeMarker(annotation);

		// clear
		$text.val('');
		$anchor.text("Attach");
		$text.prop("disabled", false);

		rendition.off("click", insertAtPoint);

	};

	var addAnnotation = function(annotation){
		var note = document.createElement("li");
		var link = document.createElement("a");

		note.innerHTML = annotation.body;
		// note.setAttribute("ref", annotation.anchor);
		link.innerHTML = " context &#187;";
		link.href = "#"+annotation.anchor;
		link.onclick = function(){
			try {
				if (window.__fbOpenNoteAtCfi) {
					window.__fbOpenNoteAtCfi(annotation.anchor);
					return false;
				}
			} catch (eOpen) {}
			rendition.display(annotation.anchor);
			return false;
		};

		note.appendChild(link);
		$notes.append(note);

	};

	var placeMarker = function(annotation){
		var doc = book.renderer.doc;
		var marker = document.createElement("span");
		var mark = document.createElement("a");
		marker.classList.add("footnotesuperscript", "reader_generated");

		marker.style.verticalAlign = "super";
		marker.style.fontSize = ".75em";
		// marker.style.position = "relative";
		marker.style.lineHeight = "1em";

		// mark.style.display = "inline-block";
		mark.style.padding = "2px";
		mark.style.backgroundColor = "#fffa96";
		mark.style.borderRadius = "5px";
		mark.style.cursor = "pointer";

		marker.id = "note-"+EPUBJS.core.uuid();
		mark.innerHTML = annotations.indexOf(annotation) + 1 + "[Reader]";

		marker.appendChild(mark);
		epubcfi.addMarker(annotation.anchor, doc, marker);

		markerEvents(marker, annotation.body);
	}

	var markerEvents = function(item, txt){
		var id = item.id;

		var showPop = function(){
			var poppos,
					iheight = renderer.height,
					iwidth = renderer.width,
			 		tip,
					pop,
					maxHeight = 225,
					itemRect,
					left,
					top,
					pos;


			//-- create a popup with endnote inside of it
			if(!popups[id]) {
				popups[id] = document.createElement("div");
				popups[id].setAttribute("class", "popup");

				pop_content = document.createElement("div");

				popups[id].appendChild(pop_content);

				pop_content.innerHTML = txt;
				pop_content.setAttribute("class", "pop_content");

				renderer.render.document.body.appendChild(popups[id]);

				//-- TODO: will these leak memory? - Fred
				popups[id].addEventListener("mouseover", onPop, false);
				popups[id].addEventListener("mouseout", offPop, false);

				//-- Add hide on page change
				rendition.on("locationChanged", hidePop, this);
				rendition.on("locationChanged", offPop, this);
				// chapter.book.on("renderer:chapterDestroy", hidePop, this);
			}

			pop = popups[id];


			//-- get location of item
			itemRect = item.getBoundingClientRect();
			left = itemRect.left;
			top = itemRect.top;

			//-- show the popup
			pop.classList.add("show");

			//-- locations of popup
			popRect = pop.getBoundingClientRect();

			//-- position the popup
			pop.style.left = left - popRect.width / 2 + "px";
			pop.style.top = top + "px";


			//-- Adjust max height
			if(maxHeight > iheight / 2.5) {
				maxHeight = iheight / 2.5;
				pop_content.style.maxHeight = maxHeight + "px";
			}

			//-- switch above / below
			if(popRect.height + top >= iheight - 25) {
				pop.style.top = top - popRect.height  + "px";
				pop.classList.add("above");
			}else{
				pop.classList.remove("above");
			}

			//-- switch left
			if(left - popRect.width <= 0) {
				pop.style.left = left + "px";
				pop.classList.add("left");
			}else{
				pop.classList.remove("left");
			}

			//-- switch right
			if(left + popRect.width / 2 >= iwidth) {
				//-- TEMP MOVE: 300
				pop.style.left = left - 300 + "px";

				popRect = pop.getBoundingClientRect();
				pop.style.left = left - popRect.width + "px";
				//-- switch above / below again
				if(popRect.height + top >= iheight - 25) {
					pop.style.top = top - popRect.height  + "px";
					pop.classList.add("above");
				}else{
					pop.classList.remove("above");
				}

				pop.classList.add("right");
			}else{
				pop.classList.remove("right");
			}

		}

		var onPop = function(){
			popups[id].classList.add("on");
		}

		var offPop = function(){
			popups[id].classList.remove("on");
		}

		var hidePop = function(){
			setTimeout(function(){
				popups[id].classList.remove("show");
			}, 100);
		}

		var openSidebar = function(){
			try {
				if (window.__fbOpenLibraryOverlayTab) {
					window.__fbOpenLibraryOverlayTab("notes");
					return;
				}
			} catch (eOpenOverlay) {}
			show();
		};

		item.addEventListener("mouseover", showPop, false);
		item.addEventListener("mouseout", hidePop, false);
		item.addEventListener("click", openSidebar, false);

	}
	$anchor.on("click", function(e){

		$anchor.text("Cancel");
		$text.prop("disabled", "true");
		// listen for selection
		rendition.on("click", insertAtPoint);

	});

	annotations.forEach(function(note) {
		addAnnotation(note);
	});

	/*
	renderer.registerHook("beforeChapterDisplay", function(callback, renderer){
		var chapter = renderer.currentChapter;
		annotations.forEach(function(note) {
			var cfi = epubcfi.parse(note.anchor);
			if(cfi.spinePos === chapter.spinePos) {
				try {
					placeMarker(note);
				} catch(e) {
					console.log("anchoring failed", note.anchor);
				}
			}
		});
		callback();
	}, true);
	*/

	return {
		"show" : show,
		"hide" : hide
	};
};

EPUBJS.reader.ReaderController = function(book) {
	var $main = $("#main"),
			$divider = $("#divider"),
			$loader = $("#loader"),
			$next = $("#next"),
			$prev = $("#prev");
	var reader = this;
	var book = this.book;
	var rendition = this.rendition;
	var slideIn = function() {
		$main.removeClass("closed");
	};

	var slideOut = function() {
		var location = rendition.currentLocation();
		if (!location) {
			return;
		}
		$main.addClass("closed");
	};

	var showLoader = function() {
		$loader.show();
		hideDivider();
	};

	var hideLoader = function() {
		$loader.hide();

		//-- If the book is using spreads, show the divider
		// if(book.settings.spreads) {
		// 	showDivider();
		// }
	};

	var showDivider = function() {
		$divider.addClass("show");
	};

	var hideDivider = function() {
		$divider.removeClass("show");
	};

	var keylock = false;

	function isRtlReadingOrderSafe() {
		try {
			var md = book && book.package && book.package.metadata ? book.package.metadata : null;
			if (!md) return false;
			var dir = ((md.direction || "") + "").toLowerCase();
			if (dir !== "rtl") return false;
			var lang = ((md.language || md.lang || "") + "").toLowerCase();
			if (!lang) return false;
			return /^(ar|fa|he|ur|ps|sd|yi|ug|dv|ku|ckb)\b/.test(lang);
		} catch (e) {}
		return false;
	}

	function getActiveSwipeDoc() {
		try {
			var iframe = document.querySelector("#viewer iframe");
			if (iframe && iframe.contentDocument && iframe.contentDocument.__fbQuickSwipeTurn) return iframe.contentDocument;
		} catch (e0) {}
		try {
			var views = rendition && rendition.manager && rendition.manager.views ? rendition.manager.views() : null;
			if (views && views.length) {
				for (var i = 0; i < views.length; i++) {
					var view = views[i];
					var doc = view && view.document ? view.document : null;
					if (doc && doc.__fbQuickSwipeTurn) return doc;
				}
			}
		} catch (e1) {}
		return null;
	}

	function runQuickSwipeByUi(isNext) {
		try {
			if (typeof window.__fbQuickSwipeTurn === "function") {
				window.__fbQuickSwipeTurn(!!isNext);
				return;
			}
		} catch (eGlobalQuickTurn) {}
		var activeDoc = getActiveSwipeDoc();
		if (activeDoc && typeof activeDoc.__fbQuickSwipeTurn === "function") {
			try {
				activeDoc.__fbQuickSwipeTurn(!!isNext);
				return;
			} catch (e0) {}
		}
		if (isRtlReadingOrderSafe()) {
			if (isNext) rendition.prev();
			else rendition.next();
		} else {
			if (isNext) rendition.next();
			else rendition.prev();
		}
	}

	function goNextByUi() {
		runQuickSwipeByUi(true);
	}

	function goPrevByUi() {
		runQuickSwipeByUi(false);
	}

	try {
		window.__fbGoNextPage = goNextByUi;
		window.__fbGoPrevPage = goPrevByUi;
	} catch (eExposeNav) {}

	var arrowKeys = function(e) {
		if(e.keyCode == 37) {

			goPrevByUi();

			$prev.addClass("active");

			keylock = true;
			setTimeout(function(){
				keylock = false;
				$prev.removeClass("active");
			}, 100);

			 e.preventDefault();
		}
		if(e.keyCode == 39) {

			goNextByUi();

			$next.addClass("active");

			keylock = true;
			setTimeout(function(){
				keylock = false;
				$next.removeClass("active");
			}, 100);

			 e.preventDefault();
		}
	}

	document.addEventListener('keydown', arrowKeys, false);

	$next.on("click", function(e){
		goNextByUi();
		e.preventDefault();
	});

	$prev.on("click", function(e){
		goPrevByUi();
		e.preventDefault();
	});

	rendition.on("layout", function(props){
		if(props.spread === true) {
			showDivider();
		} else {
			hideDivider();
		}
	});

	rendition.on('relocated', function(location){
		if (location.atStart) {
			$prev.addClass("disabled");
		}
		if (location.atEnd) {
			$next.addClass("disabled");
		}
	});

	return {
		"slideOut" : slideOut,
		"slideIn"  : slideIn,
		"showLoader" : showLoader,
		"hideLoader" : hideLoader,
		"showDivider" : showDivider,
		"hideDivider" : hideDivider,
		"arrowKeys" : arrowKeys
	};
};

EPUBJS.reader.SettingsController = function() {
	var book = this.book;
	// Settings modal removed in this UI
	if (!document.getElementById('settings-modal')) {
		return { show: function(){}, hide: function(){} };
	}
	
	var reader = this;
	var $settings = $("#settings-modal"),
			$overlay = $(".overlay");

	var show = function() {
		$settings.addClass("md-show");
	};

	var hide = function() {
		$settings.removeClass("md-show");
	};

	$settings.find(".closer").on("click", function() {
		hide();
	});

	$overlay.on("click", function() {
		hide();
	});

	return {
		"show" : show,
		"hide" : hide
	};
};
EPUBJS.reader.TocController = function(toc) {
	var reader = this;
	var book = this.book;
	var rendition = this.rendition;

	var $list = $("#tocView"),
			docfrag = document.createDocumentFragment();

	var currentChapter = false;

	var isJsonManifestBook = function() {
		try {
			return !!(reader && reader.book && reader.book.package && reader.book.package.isJsonManifest);
		} catch (e) {}
		return false;
	};

	// TOC labels: приводим к строго заданному виду (как пользователь хочет)
	var normalizeTocLabel = function(label) {
		if (!label) return "";
		var s = String(label).replace(/\s+/g, " ").trim();
		if (!s) return "";
		var key = s.toLowerCase();
		// нормализация типографики/пробелов вокруг точек
		key = key.replace(/\s*\.\s*/g, ". ");

			var map = {
				"вопрос": "ВОПРОС - Тони Вивер",
			"пролог": "ПРОЛОГ",
			"эпилог": "ЭПИЛОГ",
			"от автора": "От автора",
			"глава 1. ультиматум": "Глава 1. Ультиматум",
			"глава 2. 1990-1998": "Глава 2. 1990-1998",
			"глава 3. переход": "Глава 3. Переход",
			"глава 4. 1999-2007": "Глава 4. 1999-2007",
			"глава 5. тупик": "Глава 5. Тупик",
			"глава 6. 2008-2018": "Глава 6. 2008-2018",
			"глава 7. взрыв и надежда": "Глава 7. Взрыв и надежда",
			"глава 8. 2019-2026": "Глава 8. 2019-2026",
			"глава 9. поколение dd": "Глава 9. Поколение DD",
			"глава 10. сэма больше нет": "Глава 10. Сэма больше нет",
			"глава 11. вопросы": "Глава 11. Вопросы",
			"глава 12. ответы": "Глава 12. Ответы",
			"глава 13. пророк": "Глава 13. Пророк"
		};

		if (map[key]) return map[key];

		// если пришло что-то не из списка — хотя бы убираем КАПС,
		// кроме полностью заданных ПРОЛОГ/ЭПИЛОГ
		if (/^[A-ZА-ЯЁ0-9 .\-–—()]+$/.test(s)) {
			var lower = s.toLowerCase();
			return lower.charAt(0).toUpperCase() + lower.slice(1);
		}
		return s;
	};

	var generateTocItems = function(toc, level) {
		var container = document.createElement("ul");

		if(!level) level = 1;

		toc.forEach(function(chapter) {
			var listitem = document.createElement("li"),
					link = document.createElement("a");
					toggle = document.createElement("a");

			var subitems;

			listitem.id = "toc-"+chapter.id;
			listitem.classList.add('list_item');

				link.textContent = normalizeTocLabel(chapter.label);
			link.href = chapter.href;

			link.classList.add('toc_link');

			listitem.appendChild(link);

			if(chapter.subitems && chapter.subitems.length > 0) {
				level++;
				subitems = generateTocItems(chapter.subitems, level);
				toggle.classList.add('toc_toggle');

				listitem.insertBefore(toggle, link);
				listitem.appendChild(subitems);
			}


			container.appendChild(listitem);

		});

		return container;
	};

	var onShow = function() {
		$list.show();
	};

	var onHide = function() {
		$list.hide();
	};

	var chapterChange = function(e) {
		var id = e.id,
				$item = $list.find("#toc-"+id),
				$current = $list.find(".currentChapter"),
				$open = $list.find('.openChapter');

		if($item.length){

			if($item != $current && $item.has(currentChapter).length > 0) {
				$current.removeClass("currentChapter");
			}

			$item.addClass("currentChapter");

			// $open.removeClass("openChapter");
			$item.parents('li').addClass("openChapter");
		}
	};

	rendition.on('rendered', chapterChange);

	// Ensure current TOC item is always highlighted based on where the reader is
	rendition.on('relocated', function(loc) {
		try {
			if (!loc || !loc.start) return;
			var href = loc.start.href || null;
			if (!href) return;
			href = String(href).split('#')[0];
			var $links = $list.find('.toc_link');
			var $best = null;
			$links.each(function() {
				var h = this.getAttribute('href') || '';
				h = String(h).split('#')[0];
				if (h === href) { $best = $(this).parent(); return false; }
			});
			if ($best && $best.length) {
				var $current = $list.find('.currentChapter');
				if ($current.length && !$best.is($current)) {
					$current.removeClass('currentChapter');
				}
				$best.addClass('currentChapter');
				$best.parents('li').addClass('openChapter');
			}
		} catch (e) {}
	});

	var tocitems = generateTocItems(toc);

	docfrag.appendChild(tocitems);

	$list.append(docfrag);
	$list.find(".toc_link").on("click", function(event){
			var url = this.getAttribute('href');

			event.preventDefault();

			//-- Provide the Book with the url to show
			//   The Url must be found in the books manifest
			try { if (reader.__markNavigationInProgress) reader.__markNavigationInProgress(1800); } catch (eNavToc) {}
			var targetUrl = url;
			try {
				if (targetUrl && isJsonManifestBook()) {
					targetUrl = String(targetUrl).split("#")[0];
				}
			} catch (eTargetUrl) {}
			Promise.resolve(rendition.display(targetUrl)).then(function () {
				try {
					var loc = rendition && rendition.currentLocation ? rendition.currentLocation() : null;
					if (loc) {
						reader._lastRelocated = loc;
						if (reader.__updateSwipeNeighbors) reader.__updateSwipeNeighbors(loc);
					}
				} catch (eAfterDisplay) {}
				try {
					if (reader.__scheduleGlobalPageMapRebuild && isJsonManifestBook()) {
						reader.__scheduleGlobalPageMapRebuild("toc-nav", false);
					}
				} catch (eAfterMap) {}
			}).catch(function () {});

			$list.find(".currentChapter")
					.addClass("openChapter")
					.removeClass("currentChapter");

			$(this).parent('li').addClass("currentChapter");

			// Close overlays after choosing a chapter
			try {
				if (window.__fbCloseAndHideAfterNavigation) window.__fbCloseAndHideAfterNavigation();
				else if (window.__fbCloseOverlays) window.__fbCloseOverlays();
			} catch(e) {}

	});

	$list.find(".toc_toggle").on("click", function(event){
			var $el = $(this).parent('li'),
					open = $el.hasClass("openChapter");

			event.preventDefault();
			if(open){
				$el.removeClass("openChapter");
			} else {
				$el.addClass("openChapter");
			}
	});

return {
		"show" : onShow,
		"hide" : onHide
	};
};

// ---- My Books (recently opened) ----
(function () {
	function isDemoEntry() {
		try {
			var ctx = window.__readerpubEntryContext || null;
			return !!(ctx && ctx.isDemoEntry);
		} catch (e) {
			return false;
		}
	}

	function currentDemoBookId() {
		if (!isDemoEntry()) return "";
		return String(getBookId() || "");
	}

	function getBookId() {
		try {
			var params = new URLSearchParams(window.location.search || "");
			var qid = params.get("id");
			if (qid && qid.trim()) return qid.trim();
		} catch (e) {}
		try {
			var hid = (window.location.hash || "").replace(/^#/, "");
			if (hid && hid.trim()) return hid.trim();
		} catch (e2) {}
		return "";
	}

	function getBookCoverHint() {
		try {
			var params = new URLSearchParams(window.location.search || "");
			var cover = params.get("cover");
			if (cover) return String(cover);
		} catch (e0) {}
		return "";
	}

	function setMenuBookMeta(data) {
		try {
			var titleEl = document.getElementById("menuBookTitle");
			var authorEl = document.getElementById("menuBookAuthor");
			var coverEl = document.getElementById("menuBookCover");
			var placeholderEl = document.getElementById("menuBookCoverPlaceholder");
			var title = String((data && data.title) || "").trim();
			var author = String((data && data.author) || "").trim();
			var cover = String((data && data.cover) || "").trim();
			if (titleEl) titleEl.textContent = title;
			if (authorEl) authorEl.textContent = author;
			if (coverEl) {
				if (cover) {
					coverEl.src = cover;
					coverEl.alt = title ? (title + " cover") : "Book cover";
					coverEl.classList.remove("hidden");
					if (placeholderEl) placeholderEl.classList.add("hidden");
				} else {
					coverEl.removeAttribute("src");
					coverEl.classList.add("hidden");
					if (placeholderEl) placeholderEl.classList.remove("hidden");
				}
			}
		} catch (e) {}
	}

	function syncMenuBookMetaFromDom() {
		try {
			var titleEl = document.getElementById("book-title");
			var authorEl = document.getElementById("chapter-title");
			setMenuBookMeta({
				title: titleEl ? titleEl.textContent : "",
				author: authorEl ? authorEl.textContent : "",
				cover: getBookCoverHint()
			});
		} catch (e) {}
	}

	function readerHrefFromBook(item) {
		var id = String((item && item.id) || "");
		if (!id) return "?id=";
		var href = "?id=" + encodeURIComponent(id);
		var cover = String((item && (item.cover || item.coverUrl || item.cover_url)) || "");
		if (cover) href += "&cover=" + encodeURIComponent(cover);
		href += "&entry=mybooks";
		return href;
	}

	var STORAGE_KEY = "readerpub:mybooks:" + window.location.host;
	var _memoryList = [];
	var _lastSaveOk = null;
	var _driveHydrated = false;

	function getDriveSync() {
		try {
			return window.ReaderPubDriveSync || null;
		} catch (e) {
			return null;
		}
	}

	function getStorage() {
		try {
			return window.localStorage || null;
		} catch (e) {
			return null;
		}
	}

	function loadList() {
		var storage = getStorage();
		if (!storage) return _memoryList.slice();
		try {
			var raw = storage.getItem(STORAGE_KEY);
			if (!raw) return _memoryList.slice();
			var parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				_memoryList = parsed.slice();
				return parsed;
			}
			return _memoryList.slice();
		} catch (e) {
			return _memoryList.slice();
		}
	}

	function purgeDemoBookFromLocalMyBooks() {
		if (!isDemoEntry()) return;
		var id = getBookId();
		if (!id) return;
		var list = loadList();
		var next = [];
		var changed = false;
		for (var i = 0; i < list.length; i++) {
			var item = list[i];
			if (item && String(item.id) === String(id)) {
				changed = true;
				continue;
			}
			next.push(item);
		}
		if (!changed) return;
		saveList(next);
		render(next);
	}

	function saveList(list) {
		_memoryList = Array.isArray(list) ? list.slice() : [];
		var storage = getStorage();
		if (!storage) { _lastSaveOk = false; return; }
		try {
			storage.setItem(STORAGE_KEY, JSON.stringify(list || []));
			_lastSaveOk = true;
		} catch (e) { _lastSaveOk = false; }
	}

	function render(list) {
		var ul = document.getElementById("mybooks");
		if (!ul) return;
		var items = list || loadList();
		var demoBookId = currentDemoBookId();
		while (ul.firstChild) ul.removeChild(ul.firstChild);
		for (var i = 0; i < items.length; i++) {
			var item = items[i];
			if (!item || !item.id) continue;
			if (demoBookId && String(item.id) === demoBookId) continue;
			var li = document.createElement("li");
			li.className = "list_item";
			li.setAttribute("data-book-id", item.id);

			var wrap = document.createElement("div");
			wrap.className = "bookmark-text";

			var link = document.createElement("a");
			link.className = "bookmark_link";
			link.textContent = item.title || ("Book " + item.id);
				link.href = readerHrefFromBook(item);
			link.setAttribute("data-book-id", item.id);
			link.addEventListener("click", function (ev) {
				ev.preventDefault();
				var targetId = this.getAttribute("data-book-id") || "";
					if (targetId) window.location.href = this.href;
					try { if (window.__fbCloseOverlays) window.__fbCloseOverlays(); } catch (e) {}
				});

			wrap.appendChild(link);
			if (item.author) {
				var meta = document.createElement("div");
				meta.className = "bookmark-comment";
				meta.textContent = item.author;
				wrap.appendChild(meta);
			}
			li.appendChild(wrap);

			var btn = document.createElement("button");
			btn.type = "button";
			btn.className = "bookmark-delete";
			btn.setAttribute("aria-label", "Delete book");
			btn.setAttribute("data-book-id", item.id);
			btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
				+ '<path d="M4 7h16" />'
				+ '<path d="M9 7V5h6v2" />'
				+ '<rect x="6" y="7" width="12" height="13" rx="2" />'
				+ '<path d="M10 11v6" />'
				+ '<path d="M14 11v6" />'
				+ '</svg>';
			btn.addEventListener("click", function (ev) {
				ev.preventDefault();
				ev.stopPropagation();
				var bid = this.getAttribute("data-book-id");
				removeBook(bid);
			});
			li.appendChild(btn);
			ul.appendChild(li);
		}
	}

	function scheduleDriveStateSync(meta, delayMs) {
		try {
			var sync = getDriveSync();
			if (!sync || typeof sync.scheduleCurrentReaderStateSync !== "function") return;
			sync.scheduleCurrentReaderStateSync(window.reader || null, meta || null, typeof delayMs === "number" ? delayMs : 300);
		} catch (e) {}
	}

	function hydrateFromDriveSilent() {
		if (_driveHydrated) return;
		_driveHydrated = true;
		try {
			var sync = getDriveSync();
			if (!sync || typeof sync.pullSnapshot !== "function") return;
			sync.pullSnapshot({ interactive: false }).then(function (snapshot) {
				try {
					if (typeof sync.applySnapshotToLocalReader === "function") sync.applySnapshotToLocalReader(snapshot);
				} catch (eApply) {}
				try {
					if (typeof sync.listMyBooks === "function") {
						render(sync.listMyBooks(snapshot));
						return;
					}
				} catch (eList) {}
				render();
			}).catch(function () {});
		} catch (e) {}
	}

	function addFromMeta(title, author) {
		if (isDemoEntry()) return;
		var id = getBookId();
		if (!id || !/^\d+$/.test(id)) return;
		upsertBook({ id: id, title: title || "", author: author || "" });
	}

	function upsertBook(entry) {
		if (isDemoEntry()) return;
		if (!entry || !entry.id) return;
		var list = loadList();
		var now = Date.now();
		var existingIndex = -1;
		for (var i = 0; i < list.length; i++) {
			if (String(list[i].id) === String(entry.id)) {
				existingIndex = i;
				break;
			}
		}
		var next = {
			id: entry.id,
			title: entry.title || (existingIndex >= 0 ? (list[existingIndex].title || "") : ""),
			author: entry.author || (existingIndex >= 0 ? (list[existingIndex].author || "") : ""),
			cover: entry.cover || entry.coverUrl || entry.cover_url || (existingIndex >= 0 ? (list[existingIndex].cover || "") : ""),
			openedAt: now
		};
		if (existingIndex >= 0) list.splice(existingIndex, 1);
		list.unshift(next);
		if (list.length > 200) list.length = 200;
		saveList(list);
		render(list);
		scheduleDriveStateSync({
			id: String(entry.id),
			title: entry.title || "",
			author: entry.author || "",
			cover: entry.cover || entry.coverUrl || entry.cover_url || ""
		}, 250);
	}

	function ensureCurrentBook() {
		if (isDemoEntry()) return;
		var id = getBookId();
		if (!id || !/^\d+$/.test(id)) return;
		upsertBook({ id: id, title: "", author: "", cover: getBookCoverHint() });
	}

	function removeBook(id) {
		if (!id) return;
		var list = loadList();
		for (var i = 0; i < list.length; i++) {
			if (String(list[i].id) === String(id)) {
				list.splice(i, 1);
				break;
			}
		}
		saveList(list);
		render(list);
		try {
			var sync = getDriveSync();
			if (!sync || typeof sync.deleteBooksCascade !== "function") return;
			sync.deleteBooksCascade([String(id)], { interactive: false }).then(function (snapshot) {
				try {
					if (typeof sync.applySnapshotToLocalReader === "function") sync.applySnapshotToLocalReader(snapshot);
				} catch (eApply) {}
				try {
					if (typeof sync.listMyBooks === "function") {
						render(sync.listMyBooks(snapshot));
						return;
					}
				} catch (eList) {}
				render();
			}).catch(function () {});
		} catch (e0) {}
	}

	function syncFromDom() {
		try {
			var titleEl = document.getElementById("book-title");
			var authorEl = document.getElementById("chapter-title");
			var title = titleEl ? titleEl.textContent : "";
			var author = authorEl ? authorEl.textContent : "";
			if ((title && title.trim()) || (author && author.trim())) {
				addFromMeta(title, author);
			}
		} catch (e) {}
	}

	window.__fbMyBooks = {
		addFromMeta: addFromMeta,
		render: render,
		remove: removeBook,
		syncFromDom: syncFromDom,
		ensureCurrentBook: ensureCurrentBook
	};

	window.__fbUpdateMenuBookMeta = function (payload) {
		var next = payload && typeof payload === "object" ? payload : {};
		setMenuBookMeta({
			title: next.title || "",
			author: next.author || "",
			cover: next.cover || getBookCoverHint()
		});
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", function () {
			purgeDemoBookFromLocalMyBooks();
			render();
			hydrateFromDriveSilent();
			ensureCurrentBook();
			syncMenuBookMetaFromDom();
			setTimeout(syncFromDom, 600);
		});
	} else {
		purgeDemoBookFromLocalMyBooks();
		render();
		hydrateFromDriveSilent();
		ensureCurrentBook();
		syncMenuBookMetaFromDom();
		setTimeout(syncFromDom, 600);
	}
})();

//# sourceMappingURL=reader.js.map
