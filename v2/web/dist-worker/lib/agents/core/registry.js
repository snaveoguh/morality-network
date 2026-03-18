"use strict";
// ─── Agent Core — Registry ─────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentRegistry = void 0;
class AgentRegistry {
    agents = new Map();
    initialized = false;
    /** Register an agent (does not start it) */
    register(agent) {
        if (this.agents.has(agent.id)) {
            console.warn(`[AgentRegistry] "${agent.id}" already registered, skipping`);
            return;
        }
        this.agents.set(agent.id, agent);
        console.log(`[AgentRegistry] Registered: ${agent.id}`);
        // If registry is already running, start hot-registered agents immediately.
        if (this.initialized) {
            try {
                agent.start();
                console.log(`[AgentRegistry] Started (hot): ${agent.id}`);
            }
            catch (err) {
                console.error(`[AgentRegistry] Failed to start hot agent ${agent.id}:`, err);
            }
        }
    }
    /** Initialize and start all registered agents (idempotent) */
    initAll() {
        if (this.initialized)
            return;
        this.initialized = true;
        console.log(`[AgentRegistry] Starting ${this.agents.size} agent(s)...`);
        for (const agent of this.agents.values()) {
            try {
                agent.start();
                console.log(`[AgentRegistry] Started: ${agent.id}`);
            }
            catch (err) {
                console.error(`[AgentRegistry] Failed to start ${agent.id}:`, err);
            }
        }
    }
    /** Get a specific agent */
    get(id) {
        return this.agents.get(id);
    }
    /** Get snapshots of all agents */
    listAll() {
        return Array.from(this.agents.values()).map((a) => a.snapshot());
    }
    /** Ensure agents are initialized, then return registry */
    ensureInitialized() {
        if (!this.initialized) {
            this.initAll();
        }
        return this;
    }
    /** Stop all agents */
    stopAll() {
        for (const agent of this.agents.values()) {
            try {
                agent.stop();
            }
            catch (err) {
                console.error(`[AgentRegistry] Failed to stop ${agent.id}:`, err);
            }
        }
        this.initialized = false;
    }
}
/** Singleton */
exports.agentRegistry = new AgentRegistry();
