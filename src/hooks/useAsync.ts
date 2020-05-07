import { useState, useEffect } from 'react'

export function usePromiseAsync<A extends Array<any>, T>(
  fn: (...args: A) => Promise<T>,
  args: A,
  onFailed?: (e: Error) => void
) {
  const [result, setResult] = useState(null as null | T)
  const [loading, setLoading] = useState(true as boolean)
  const [error, setError] = useState(null as null | Error)
  useEffect(() => {
    fn.apply(fn, args)
      .then(setResult)
      .catch((e) => {
        if (onFailed) onFailed(e)
        setError(e)
      })
      .finally(() => {
        setLoading(false)
      })
  }, args)
  return { result, error, loading }
}
