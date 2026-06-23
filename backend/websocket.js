const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

/** Heartbeat interval in ms — connections that miss a pong are terminated. */
const HEARTBEAT_INTERVAL = 30000;
/** Time in ms a new socket has to send an auth message before being closed. */
const AUTH_TIMEOUT_MS = 10000;

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    /** userId → Set<ws> — supports multiple tabs per user. */
    this.clients = new Map();

    this.wss.on('connection', (ws, req) => {
      const urlParams = new URLSearchParams(req.url.split('?')[1] || '');
      const urlToken = urlParams.get('token');

      if (urlToken) {
        this._authenticateSocket(ws, urlToken);
      } else {
        ws._pendingAuth = true;

        ws._authTimeout = setTimeout(() => {
          if (ws._pendingAuth) {
            console.warn('[WS] Auth timeout — closing unauthenticated socket');
            ws.close(1008, 'Auth timeout');
          }
        }, AUTH_TIMEOUT_MS);

        ws.on('message', (raw) => {
          if (ws._pendingAuth) {
            let data;
            try { data = JSON.parse(raw); } catch (e) {
              ws.close(1008, 'Invalid auth message');
              return;
            }
            if (data.type === 'auth' && data.payload?.token) {
              clearTimeout(ws._authTimeout);
              ws._pendingAuth = false;
              this._authenticateSocket(ws, data.payload.token);
            } else {
              ws.close(1008, 'First message must be auth');
            }
            return;
          }
          this._handleMessage(ws._userId, ws, raw);
        });
      }
    });

    this._heartbeatTimer = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws._pendingAuth) return;
        if (ws.isAlive === false) {
          console.log(`[WS] Terminating stale socket for user ${ws._userId}`);
          this._removeSocket(ws._userId, ws);
          ws.terminate();
          return;
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, HEARTBEAT_INTERVAL);

    this.wss.on('close', () => {
      clearInterval(this._heartbeatTimer);
    });

    console.log('[WS] WebSocket server initialized');
  }

  /** Authenticates a socket and registers it in the clients map. */
  _authenticateSocket(ws, token) {
    let userId, userRole;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.id;
      userRole = decoded.role || 'student';
    } catch (error) {
      console.error('[WS] Invalid token, closing connection:', error.message);
      this._sendTo(ws, 'auth_failed', { message: 'Invalid or expired token' });
      ws.close(1008, 'Invalid token');
      return;
    }

    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId).add(ws);

    ws._userId = userId;
    ws._userRole = userRole;
    ws.isAlive = true;

    console.log(`[WS] User ${userId} (${userRole}) connected. Total sockets: ${this._totalSockets()}`);

    this._sendTo(ws, 'connected', {
      message: 'WebSocket connected successfully',
      userId,
      timestamp: new Date().toISOString()
    });

    if (!ws._pendingAuth) {
      ws.on('message', (raw) => {
        this._handleMessage(userId, ws, raw);
      });
    }

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('close', (code) => {
      this._removeSocket(userId, ws);
      console.log(`[WS] User ${userId} disconnected (${code}). Total sockets: ${this._totalSockets()}`);
    });

    ws.on('error', (error) => {
      console.error(`[WS] Error for user ${userId}:`, error.message);
      this._removeSocket(userId, ws);
    });
  }

  _removeSocket(userId, ws) {
    const sockets = this.clients.get(userId);
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size === 0) {
        this.clients.delete(userId);
      }
    }
  }

  _totalSockets() {
    let count = 0;
    this.clients.forEach(set => { count += set.size; });
    return count;
  }

  _sendTo(ws, type, payload = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
      return true;
    }
    return false;
  }

  _handleMessage(userId, ws, raw) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      console.error(`[WS] Failed to parse message from user ${userId}:`, error.message);
      return;
    }

    const { type, payload } = data;
    console.log(`[WS] Message from user ${userId}: type="${type}"`);

    switch (type) {

      case 'ping':
        this._sendTo(ws, 'pong', {
          timestamp: payload?.timestamp || Date.now(),
          serverTime: Date.now()
        });
        break;

      case 'idea_generated':
        this._sendTo(ws, 'idea_generation_ack', {
          message: `${payload?.count || 0} idea(s) generated successfully`,
          timestamp: new Date().toISOString()
        });
        break;

      case 'idea_saved':
        this._sendTo(ws, 'idea_save_ack', {
          message: 'Idea saved successfully',
          idea: payload?.idea,
          timestamp: new Date().toISOString()
        });
        /** Broadcast only to faculty role, not all connected clients. */
        this.broadcastToRole('faculty', 'student_idea_saved', {
          userId,
          idea: payload?.idea,
          timestamp: new Date().toISOString()
        }, userId);
        break;

      case 'idea_deleted':
        this._sendTo(ws, 'idea_delete_ack', {
          message: 'Idea removed from saved list',
          savedId: payload?.savedId,
          timestamp: new Date().toISOString()
        });
        break;

      default:
        console.log(`[WS] Unknown message type "${type}" from user ${userId}`);
        this._sendTo(ws, 'error', {
          message: `Unknown message type: ${type}`
        });
    }
  }

  sendToUser(userId, type, payload = {}) {
    const sockets = this.clients.get(userId);
    if (!sockets || sockets.size === 0) return false;
    let sent = false;
    sockets.forEach(ws => {
      if (this._sendTo(ws, type, payload)) sent = true;
    });
    return sent;
  }

  broadcastToRole(role, type, payload = {}, excludeUserId = null) {
    let count = 0;
    this.clients.forEach((sockets, userId) => {
      if (userId === excludeUserId) return;
      sockets.forEach(ws => {
        if (ws._userRole === role && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type, payload }));
          count++;
        }
      });
    });
    return count;
  }

  broadcast(type, payload = {}, excludeUserId = null) {
    let count = 0;
    this.clients.forEach((sockets, userId) => {
      if (userId === excludeUserId) return;
      sockets.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type, payload }));
          count++;
        }
      });
    });
    return count;
  }

  getConnectedCount() { return this.clients.size; }

  isUserConnected(userId) {
    const sockets = this.clients.get(userId);
    if (!sockets) return false;
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) return true;
    }
    return false;
  }

  notifyNewIdea(userId, idea) {
    this.sendToUser(userId, 'new_idea', { idea, timestamp: new Date().toISOString() });
  }

  notifyFaculty(facultyId, studentName, idea) {
    this.sendToUser(facultyId, 'student_idea_saved', { studentName, idea, timestamp: new Date().toISOString() });
  }

  notify(userId, title, message, variant = 'info') {
    this.sendToUser(userId, 'notification', { title, message, variant, timestamp: new Date().toISOString() });
  }
}

module.exports = WebSocketServer;
