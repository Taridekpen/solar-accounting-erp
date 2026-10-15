import { useCallback, useEffect, useState } from "react";

type MutationLike = {
  isPending: boolean;
  isSuccess: boolean;
  submittedAt: number;
};

const HOLD_MS = 2000;

/** Flash success for ~2s after a successful mutation. */
export function useActionSuccess(mutation: MutationLike, holdMs = HOLD_MS) {
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (mutation.isPending) {
      setSuccess(false);
      return;
    }
    if (mutation.isSuccess && mutation.submittedAt > 0) {
      setSuccess(true);
      const timer = window.setTimeout(() => setSuccess(false), holdMs);
      return () => window.clearTimeout(timer);
    }
  }, [mutation.isPending, mutation.isSuccess, mutation.submittedAt, holdMs]);

  return success;
}

type KeyedMutationLike<TVariables> = MutationLike & {
  variables?: TVariables;
};

/** Pending/success scoped to the last mutation variables (e.g. row id). */
export function useKeyedActionSuccess<TVariables>(
  mutation: KeyedMutationLike<TVariables>,
  getKey: (variables: TVariables) => string = (variables) => String(variables),
  holdMs = HOLD_MS,
) {
  const [successKey, setSuccessKey] = useState<string | null>(null);
  const pendingKey =
    mutation.isPending && mutation.variables !== undefined ? getKey(mutation.variables) : null;

  useEffect(() => {
    if (mutation.isPending) {
      setSuccessKey(null);
      return;
    }
    if (mutation.isSuccess && mutation.submittedAt > 0 && mutation.variables !== undefined) {
      const key = getKey(mutation.variables);
      setSuccessKey(key);
      const timer = window.setTimeout(() => setSuccessKey(null), holdMs);
      return () => window.clearTimeout(timer);
    }
  }, [mutation.isPending, mutation.isSuccess, mutation.submittedAt, mutation.variables, getKey, holdMs]);

  return {
    isPendingFor: (key: string) => pendingKey === key,
    isSuccessFor: (key: string) => successKey === key,
  };
}

/** Local pending/success for non-React-Query async work (e.g. PDF download). */
export function useAsyncAction(holdMs = HOLD_MS) {
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setPending(true);
      setSuccess(false);
      try {
        await fn();
        setSuccess(true);
        window.setTimeout(() => setSuccess(false), holdMs);
      } finally {
        setPending(false);
      }
    },
    [holdMs],
  );

  return { pending, success, run };
}

export function useKeyedAsyncAction(holdMs = HOLD_MS) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [successKey, setSuccessKey] = useState<string | null>(null);

  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>) => {
      setPendingKey(key);
      setSuccessKey(null);
      try {
        await fn();
        setSuccessKey(key);
        window.setTimeout(() => setSuccessKey(null), holdMs);
      } finally {
        setPendingKey(null);
      }
    },
    [holdMs],
  );

  return {
    isPendingFor: (key: string) => pendingKey === key,
    isSuccessFor: (key: string) => successKey === key,
    run,
  };
}
