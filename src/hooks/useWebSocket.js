import { useEffect, useState, useCallback, useMemo } from 'react';
import wsService from '../services/websocket';

/**
 * useWebSocket — React hook for WebSocket integration.
 *
 * @param {string[]} eventTypes - Array of WS event types to subscribe to.
 * @param {function} onMessage  - Callback fired when any subscribed event arrives.
 *
 * @returns {{ status: string, send: function, isConnected: boolean }}
 */
const useWebSocket = (eventTypes = [], onMessage = null) => {
  const [status, setStatus] = useState(wsService.getStatus());

  useEffect(() => {
    const unsub = wsService.onStatusChange(setStatus);
    return unsub;
  }, []);

  /**
   * Stabilize the eventTypes dependency so subscriptions are not
   * re-created on every render when the caller passes an inline array literal.
   */
  const eventKey = useMemo(() => [...eventTypes].sort().join(','), [eventTypes]); // eslint-disable-line

  useEffect(() => {
    if (!onMessage || eventTypes.length === 0) return;

    const unsubscribers = eventTypes.map(type =>
      wsService.subscribe(type, (payload) => {
        onMessage({ type, payload });
      })
    );

    return () => unsubscribers.forEach(unsub => unsub());
  }, [eventKey, onMessage]); // eslint-disable-line

  const send = useCallback((type, payload) => {
    return wsService.send(type, payload);
  }, []);

  return {
    status,
    send,
    isConnected: status === 'connected',
  };
};

export default useWebSocket;
