export const MSG = {
  // Agent -> Server
  AGENT_HELLO: 'agent:hello',
  AGENT_FRAME: 'agent:frame',
  AGENT_LAP_COMPLETE: 'agent:lapComplete',
  AGENT_SESSION_INFO: 'agent:sessionInfo',
  AGENT_STANDINGS: 'agent:standings',

  AGENT_PROTEST: 'agent:protest',

  // Server -> Viewer
  SESSION_SNAPSHOT: 'session:snapshot',
  DRIVER_JOINED: 'driver:joined',
  DRIVER_LEFT: 'driver:left',
  TELEMETRY_FRAME: 'telemetry:frame',
  LAP_COMPLETE: 'lap:complete',
  LAP_TRACE: 'lap:trace',
  LAP_LIST: 'lap:list',
  STINT_COMPLETE: 'stint:complete',
  STINT_LIST: 'stint:list',
  TRACK_SHAPE: 'track:shape',
  STANDINGS: 'standings',

  // Viewer -> Server
  SUBSCRIBE: 'subscribe',
  SUBSCRIBE_ALL: 'subscribe:all',
  REQUEST_LAP_TRACE: 'request:lapTrace',
  REQUEST_LAP_LIST: 'request:lapList',
  REQUEST_STINTS: 'request:stints',
  EVENT: 'event',
  EVENT_LOG: 'event:log',
  REQUEST_PROFILE: 'request:profile',
  PROFILE: 'profile',
  PROFILE_UPDATED: 'profile:updated',
  SAVE_PLAN: 'plan:save',
  LOAD_PLAN: 'plan:load',
  DELETE_PLAN: 'plan:delete',
  LIST_PLANS: 'plan:list',
  PLAN_LIST: 'plan:listResponse',
  PLAN_DATA: 'plan:data',

  // Steward -> Server
  REQUEST_INCIDENT_WINDOW: 'request:incidentWindow',
  NOTIFY_PENALTY: 'notify:penalty',
  NOTIFY_UNDER_INVESTIGATION: 'notify:underInvestigation',
  STEWARD_HELLO: 'steward:hello',
  STEWARD_LOCK_INCIDENT: 'steward:lockIncident',
  STEWARD_UNLOCK_INCIDENT: 'steward:unlockIncident',

  // Server -> Steward
  INCIDENT_WINDOW: 'incident:window',
  INCIDENT_FLAGGED: 'incident:flagged',
  BLUE_FLAG_VIOLATION: 'blueFlag:violation',
  PENALTY_SERVED: 'penalty:served',
  STEWARD_LIST: 'steward:list',
  INCIDENT_LOCKED: 'incident:locked',
  INCIDENT_UNLOCKED: 'incident:unlocked',
  DRIVER_PROTEST: 'driver:protest',

  // Server -> Agent (reverse channel)
  SERVER_PENALTY: 'server:penalty',
  SERVER_UNDER_INVESTIGATION: 'server:underInvestigation',
  SERVER_MESSAGE: 'server:message',
  SERVER_PROTEST_ACK: 'server:protestAck',
};
