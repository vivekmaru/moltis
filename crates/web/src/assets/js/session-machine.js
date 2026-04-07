export function resolveSessionExecutionRoute(entry) {
	if (entry?.machine?.executionRoute) return entry.machine.executionRoute;
	if (entry?.machine?.route) return entry.machine.route;
	if (entry?.executionRoute) return entry.executionRoute;
	if (entry?.node_id) {
		return String(entry.node_id).startsWith("ssh:") ? "ssh" : "node";
	}
	return entry?.sandbox_enabled === true ? "sandbox" : "local";
}

export function resolveSessionMachineId(entry, route = resolveSessionExecutionRoute(entry)) {
	if (entry?.machine?.id) return entry.machine.id;
	if (route === "sandbox") return "sandbox";
	if (route === "local") return "local";
	if (entry?.node_id) return entry.node_id;
	return entry?.sandbox_enabled === true ? "sandbox" : "local";
}

export function resolveSessionNodeId(entry, route = resolveSessionExecutionRoute(entry)) {
	if ((route === "ssh" || route === "node") && entry?.machine?.id) {
		return entry.machine.id;
	}
	if (entry?.node_id) return entry.node_id;
	return null;
}

export function resolveSessionSandboxEnabled(entry, route = resolveSessionExecutionRoute(entry)) {
	return route === "sandbox";
}

export function applySessionMachinePayload(target, payload, fallbackMachine = null) {
	if (!target) return;
	var machine = payload?.machine || fallbackMachine || target.machine || null;
	var normalized = {
		...(payload || {}),
		machine,
	};
	var route = resolveSessionExecutionRoute(normalized);
	target.machine = machine;
	target.node_id = resolveSessionNodeId(normalized, route);
	target.sandbox_enabled = resolveSessionSandboxEnabled(normalized, route);
	target.executionRoute = route;
}
