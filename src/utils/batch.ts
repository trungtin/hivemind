import root from 'lodash/_root'

export function batchAsync<T, R>(
  func: (...args: T[]) => R,
  wait: number
): (t: T) => R
export function batchAsync<T1, T2, R>(
  func: (...args: (T1 | T2)[]) => R,
  wait: number
): (t1: T1, t2: T2) => R
export function batchAsync<T1, T2, T3, R>(
  func: (...args: (T1 | T2 | T3)[]) => R,
  wait: number
): (t1: T1, t2: T2, t3: T3) => R
export function batchAsync<T, R>(
  func: (...args: T[]) => R,
  wait: number
): (t: T) => R {
  let calledArgs, lastThis, res, rej, timerId, lastCallTime
  let promise = (new Promise((_res, _rej) => {
    res = _res
    rej = _rej
  }) as unknown) as R
  let trailing = true

  // Bypass `requestAnimationFrame` by explicitly setting `wait=0`.
  const useRAF =
    !wait && wait !== 0 && typeof root.requestAnimationFrame === 'function'

  if (typeof func !== 'function') {
    throw new TypeError('Expected a function')
  }
  wait = +wait || 0
  function invokeFunc(time) {
    const args = calledArgs
    const thisArg = lastThis

    calledArgs = lastThis = undefined
    try {
      let result = func.apply(thisArg, args)
      res(result)
    } catch (err) {
      rej(err)
    }
    const old = promise
    promise = (new Promise((_res, _rej) => {
      res = _res
      rej = _rej
    }) as unknown) as R
    return old
  }

  function startTimer(pendingFunc, wait) {
    if (useRAF) {
      root.cancelAnimationFrame(timerId)
      return root.requestAnimationFrame(pendingFunc)
    }
    return setTimeout(pendingFunc, wait)
  }

  function cancelTimer(id) {
    if (useRAF) {
      return root.cancelAnimationFrame(id)
    }
    clearTimeout(id)
  }

  function remainingWait(time) {
    const timeSinceLastCall = time - lastCallTime
    const timeWaiting = wait - timeSinceLastCall

    return timeWaiting
  }

  function shouldInvoke(time) {
    const timeSinceLastCall = time - lastCallTime

    // Either this is the first call, activity has stopped and we're at the
    // trailing edge, the system time has gone backwards and we're treating
    // it as the trailing edge, or we've hit the `maxWait` limit.
    return (
      lastCallTime === undefined ||
      timeSinceLastCall >= wait ||
      timeSinceLastCall < 0
    )
  }

  function timerExpired() {
    const time = Date.now()
    if (shouldInvoke(time)) {
      return trailingEdge(time)
    }
    // Restart the timer.
    timerId = startTimer(timerExpired, remainingWait(time))
  }

  function trailingEdge(time) {
    timerId = undefined

    // Only invoke if we have `calledArgs` which means `func` has been
    // batched at least once.
    if (trailing && calledArgs) {
      return invokeFunc(time)
    }
    calledArgs = lastThis = undefined
    return promise
  }

  function cancel() {
    if (timerId !== undefined) {
      cancelTimer(timerId)
    }
    calledArgs = lastCallTime = lastThis = timerId = undefined
  }

  function flush() {
    return timerId === undefined ? promise : trailingEdge(Date.now())
  }

  function pending() {
    return timerId !== undefined
  }

  function batched(this: any, ...args) {
    const time = Date.now()

    calledArgs = calledArgs ? calledArgs.concat(args) : args
    lastThis = this
    lastCallTime = time

    if (timerId === undefined) {
      timerId = startTimer(timerExpired, wait)
    }
    return promise
  }
  batched.cancel = cancel
  batched.flush = flush
  batched.pending = pending
  return batched
}
