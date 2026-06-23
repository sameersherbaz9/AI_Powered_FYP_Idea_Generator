class WebSocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimer = null;
    this.pingInterval = null;
    this.token = null;
    this.connectionStatus = 'disconnected';
    this.statusListeners = [];
    /**
     * Guards against React StrictMode double-mount opening two simultaneous
     * unauthenticated sockets. Cleared only when the socket fully closes.
     */
    this._isConnecting = false;
    /** Set when the server rejects our token, so onclose won't keep retrying with the same bad token. */
    this._authFailed = false;
  }

  connect(token) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;
    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) return;
    if (this._isConnecting) return;

    this._isConnecting = true;
    this._authFailed = false;
    this.token = token;
    this._setStatus('connecting');

    const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:5000';
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      if (!this.socket) return;
      this.socket.send(JSON.stringify({ type: 'auth', payload: { token } }));
      console.log('[WS] Connected, auth message sent');
      this.reconnectAttempts = 0;
      this._isConnecting = false;
      this._setStatus('connected');
      this._startPing();
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this._handleMessage(data);
      } catch (error) {
        console.error('[WS] Error parsing message:', error);
      }
    };

    this.socket.onclose = (event) => {
      console.log('[WS] Disconnected', event.code, event.reason);
      this.socket = null;
      this._isConnecting = false;
      this._stopPing();
      this._setStatus('disconnected');
      if (!event.wasClean && !this._authFailed) {
        this._attemptReconnect();
      }
    };

    this.socket.onerror = (error) => {
      console.error('[WS] Error:', error);
      this._isConnecting = false;
      this._setStatus('error');
    };
  }

  disconnect() {
    this._stopReconnect();
    this._stopPing();
    if (this.socket) {
      this.socket.close(1000, 'User logout');
      this.socket = null;
    }
    this._isConnecting = false;
    this.listeners.clear();
    this.statusListeners = [];
    this.token = null;
    this._setStatus('disconnected');
  }

  _attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[WS] Max reconnect attempts reached');
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    this.reconnectTimer = setTimeout(() => {
      if (this.token) this.connect(this.token);
    }, delay);
  }

  _stopReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  _startPing() {
    this._stopPing();
    this.pingInterval = setInterval(() => {
      this.send('ping', { timestamp: Date.now() });
    }, 30000);
  }

  _stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  _handleMessage(data) {
    const { type, payload } = data;

    if (type === 'pong') {
      const latency = Date.now() - (payload?.timestamp || 0);
      console.log(`[WS] Pong received — latency: ${latency}ms`);
      return;
    }

    if (type === 'connected') {
      console.log('[WS] Server acknowledged:', payload?.message);
    }

    if (type === 'auth_failed') {
      console.error('[WS] Authentication failed:', payload?.message);
      this._authFailed = true;
      this._setStatus('error');
      this.socket?.close(1008, 'Auth failed');
      return;
    }

    const callbacks = this.listeners.get(type) || [];
    callbacks.forEach(callback => {
      try { callback(payload); } catch (err) {
        console.error(`[WS] Error in listener for "${type}":`, err);
      }
    });

    const wildcardCallbacks = this.listeners.get('*') || [];
    wildcardCallbacks.forEach(callback => {
      try { callback({ type, payload }); } catch (err) {
        console.error('[WS] Error in wildcard listener:', err);
      }
    });
  }

  subscribe(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(callback);
    return () => {
      const callbacks = this.listeners.get(type);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) callbacks.splice(index, 1);
      }
    };
  }

  send(type, payload = {}) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, payload }));
      return true;
    }
    console.warn(`[WS] Cannot send "${type}" — socket not open`);
    return false;
  }

  onStatusChange(callback) {
    this.statusListeners.push(callback);
    callback(this.connectionStatus);
    return () => {
      this.statusListeners = this.statusListeners.filter(cb => cb !== callback);
    };
  }

  getStatus() { return this.connectionStatus; }
  isConnected() { return this.socket && this.socket.readyState === WebSocket.OPEN; }

  notifyIdeaGenerated(ideas) { this.send('idea_generated', { ideas, count: ideas.length }); }
  notifyIdeaSaved(idea)      { this.send('idea_saved', { idea }); }
  notifyIdeaDeleted(savedId) { this.send('idea_deleted', { savedId }); }

  _setStatus(status) {
    this.connectionStatus = status;
    this.statusListeners.forEach(cb => {
      try { cb(status); } catch (e) {}
    });
  }
}

export default new WebSocketService();
