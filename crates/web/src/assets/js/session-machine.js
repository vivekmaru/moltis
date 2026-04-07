export function resolveSessionExecutionRoute(entry) {
	if (entry?.machine?.executionRoute) return entry.machine.executionRoute;
	if (entry?.machine?.route) return entry.machine.route;
	if (entry?.executionRoute) return entry.executionRoute;
	if (entry?.node_id) {
		return String(entry.node_id).startsWith("ssh:") ? "ssh" : "node";
	}
	return entry?.sandbox_enabled === true ? "sandbox" : "local";
}

function legacyMachineKind(route) {
	switch (route) {
		case "sandbox":
			return "sandbox";
		case "ssh":
			return "ssh";
		case "node":
			return "node";
		default:
			return "local";
	}
}

function legacyMachineLabel(route, machineId) {
	switch (route) {
		case "sandbox":
			return "Sandbox";
		case "ssh":
			return machineId || "SSH target";
		case "node":
			return machineId || "Paired node";
		default:
			return "Local host";
	}
}

function legacyMachineTrustState(route) {
	switch (route) {
		case "sandbox":
			return "sandboxed";
		case "ssh":
			return "managed_ssh";
		case "node":
			return "paired_node";
		default:
			return "trusted_local";
	}
}

export function resolveSessionMachineId(entry, route = resolveSessionExecutionRoute(entry)) {
	if (entry?.machine?.id) return entry.machine.id;
	if (route === "sandbox") return "sandbox";
	if (route === "local") return "local";
	if (entry?.node_id) return entry.node_id;
	return entry?.sandbox_enabled === true ? "sandbox" : "local";
}

export function resolveSessionNodeId(entry, route = resolveSessionExecutionRoute(entry)) {
	if (route === "ssh" || route === "node") {
		if (entry?.machine?.nodeId) return entry.machine.nodeId;
		if (entry?.machine?.id) return entry.machine.id;
	}
	if (entry?.node_id) return entry.node_id;
	return null;
}

export function resolveSessionSandboxEnabled(entry, route = resolveSessionExecutionRoute(entry)) {
	return route === "sandbox";
}

export function normalizeSessionMachine(entry, fallbackMachine = null) {
	var route = resolveSessionExecutionRoute(entry);
	var hasExplicitMachine = Boolean(entry?.machine?.id);
	var hasNormalizedRoute = Boolean(entry?.machine?.executionRoute || entry?.machine?.route || entry?.executionRoute);
	var machine = entry?.machine || (!hasExplicitMachine && hasNormalizedRoute ? fallbackMachine : null) || null;
	if (machine?.id) return machine;
	var machineId = resolveSessionMachineId(entry, route);
	return {
		id: machineId,
		kind: legacyMachineKind(route),
		route,
		executionRoute: route,
		label: legacyMachineLabel(route, machineId),
		trustState: legacyMachineTrustState(route),
		health: machineId ? "ready" : "unavailable",
		available: route === "local" || route === "sandbox" ? true : Boolean(machineId),
		nodeId: resolveSessionNodeId(entry, route),
	};
}

export function applySessionMachinePayload(target, payload, fallbackMachine = null) {
	if (!target) return;
	var machine = normalizeSessionMachine(payload || target, fallbackMachine || target.machine || null);
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
