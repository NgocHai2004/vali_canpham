import { useState, useEffect } from "react";
import { notify } from "../notifications";

export function useNotifState() {
  const [state, setState] = useState(() => ({
    items: notify.list(),
    unread: notify.unreadCount(),
  }));
  useEffect(() => {
    return notify.subscribe(() => {
      setState({ items: notify.list(), unread: notify.unreadCount() });
    });
  }, []);
  return state;
}

export default useNotifState;
