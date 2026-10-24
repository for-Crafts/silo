"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { beginSave, endSave } from "@/lib/save-status";
import { SAVE_ERROR } from "@/lib/format";

/**
 * 複数フィールドの変更を 1 つにまとめて保存するキュー。
 * - queue(fields) は即座に戻る（UI は先に更新しておく）
 * - ms 無操作で、溜まった変更を 1 リクエストで送る
 * - immediate=true なら次のティックで送る（チップ切替など）
 * - タブを閉じる・隠す・画面を離れるときは未送信分を即送信
 */
export function usePatchQueue<T extends Record<string, unknown>>(
  save: (fields: Partial<T>) => Promise<boolean>,
  ms = 700
) {
  const pending = useRef<Partial<T>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counted = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const fields = pending.current;
    pending.current = {};
    const wasCounted = counted.current;
    counted.current = false;
    if (Object.keys(fields).length === 0) {
      if (wasCounted) endSave(true);
      return;
    }
    const ok = await saveRef.current(fields);
    if (wasCounted) endSave(ok);
    if (!ok) {
      toast.error(SAVE_ERROR);
      // 失敗分は次の変更と一緒に再送する（新しい値が来ていればそちらを優先）
      pending.current = { ...fields, ...pending.current };
    }
  }, []);

  const queue = useCallback(
    (fields: Partial<T>, immediate = false) => {
      pending.current = { ...pending.current, ...fields };
      if (!counted.current) {
        counted.current = true;
        beginSave();
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, immediate ? 0 : ms);
    },
    [flush, ms]
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onPageHide = () => void flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      void flush(); // 画面遷移時
    };
  }, [flush]);

  return { queue, flush };
}

/** キーごと（行 ID ごと）にまとめるキュー。発話表の各行など。 */
export function useKeyedPatchQueue<T extends Record<string, unknown>>(
  save: (key: string, fields: Partial<T>) => Promise<boolean>,
  ms = 600
) {
  const pending = useRef(new Map<string, Partial<T>>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saveRef = useRef(save);
  saveRef.current = save;

  const flushKey = useCallback(async (key: string) => {
    const t = timers.current.get(key);
    if (t) clearTimeout(t);
    timers.current.delete(key);
    const fields = pending.current.get(key);
    pending.current.delete(key);
    if (!fields) return;
    const ok = await saveRef.current(key, fields);
    endSave(ok);
    if (!ok) toast.error(SAVE_ERROR);
  }, []);

  const flushAll = useCallback(() => {
    [...pending.current.keys()].forEach((k) => void flushKey(k));
  }, [flushKey]);

  const queue = useCallback(
    (key: string, fields: Partial<T>) => {
      const had = pending.current.has(key);
      pending.current.set(key, { ...(pending.current.get(key) ?? {}), ...fields });
      if (!had) beginSave();
      const t = timers.current.get(key);
      if (t) clearTimeout(t);
      timers.current.set(key, setTimeout(() => void flushKey(key), ms));
    },
    [flushKey, ms]
  );

  /** 削除した行の未送信分を捨てる */
  const drop = useCallback((key: string) => {
    const t = timers.current.get(key);
    if (t) clearTimeout(t);
    timers.current.delete(key);
    if (pending.current.delete(key)) endSave(true);
  }, []);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushAll();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushAll);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushAll);
      flushAll();
    };
  }, [flushAll]);

  return { queue, drop, flushAll };
}
