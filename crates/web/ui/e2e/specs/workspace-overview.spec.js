const { expect, test } = require("../base-test");
const {
	createSession,
	navigateAndWait,
	openChatMoreModal,
	waitForWsConnected,
	watchPageErrors,
} = require("../helpers");

test.describe("Workspace overview", () => {
	test("shows the workspace preferred machine separately from the active route", async ({ page }) => {
		const pageErrors = watchPageErrors(page);
		await navigateAndWait(page, "/chats/main");
		await waitForWsConnected(page);
		await createSession(page);

		await page.evaluate(async () => {
			const appScript = document.querySelector('script[type="module"][src*="js/app.js"]');
			if (!appScript) throw new Error("app module script not found");
			const appUrl = new URL(appScript.src, window.location.origin);
			const prefix = appUrl.href.slice(0, appUrl.href.length - "js/app.js".length);
			const [sessionModule, state] = await Promise.all([
				import(`${prefix}js/stores/session-store.js`),
				import(`${prefix}js/state.js`),
			]);

			const sessionKey = sessionModule.activeSessionKey.value;
			const overviewPayload = {
				workspaceId: "workspace-e2e",
				workspaceLabel: "E2E Workspace",
				currentBranch: null,
				currentExecutionRoute: "local",
				approvalMode: "smart",
				coordination: {
					decision: null,
					currentPlan: null,
					nextAction: null,
					routeConstraints: null,
					durableNotes: null,
				},
				memorySummary: null,
				externalActivities: [],
				externalActivitySummary: { count: 0, sources: {} },
				recentSessions: [],
				machine: {
					id: "local",
					kind: "local",
					label: "Local host",
					executionRoute: "local",
					route: "local",
					trustState: "trusted_local",
					health: "ready",
					available: true,
					nodeId: null,
				},
				linkedProject: {
					id: "workspace-e2e",
					label: "E2E Workspace",
					directory: "/tmp/moltis-e2e-workspace",
					preferredMachineId: "sandbox",
					preferredMachine: {
						id: "sandbox",
						kind: "sandbox",
						label: "Sandbox",
						executionRoute: "sandbox",
						route: "sandbox",
						trustState: "sandboxed",
						health: "ready",
						available: true,
						nodeId: null,
					},
				},
			};
			const machinesPayload = [
				{
					id: "local",
					kind: "local",
					label: "Local host",
					executionRoute: "local",
					route: "local",
					trustState: "trusted_local",
					health: "ready",
					available: true,
					platform: "local",
					nodeId: null,
					remoteIp: null,
					hostPinned: null,
					telemetryStale: null,
					capabilities: ["system.run"],
					commands: ["system.run"],
				},
				{
					id: "sandbox",
					kind: "sandbox",
					label: "Sandbox",
					executionRoute: "sandbox",
					route: "sandbox",
					trustState: "sandboxed",
					health: "ready",
					available: true,
					platform: "sandbox",
					nodeId: null,
					remoteIp: null,
					hostPinned: null,
					telemetryStale: null,
					capabilities: ["system.run"],
					commands: ["system.run"],
				},
				{
					id: "node-build",
					kind: "node",
					label: "Build box",
					executionRoute: "node",
					route: "node",
					trustState: "paired_node",
					health: "degraded",
					available: true,
					platform: "linux",
					nodeId: "node-build",
					remoteIp: "10.0.0.5",
					hostPinned: null,
					telemetryStale: true,
					capabilities: ["system.run", "files.read"],
					commands: ["system.run"],
				},
			];
			function parseRpcPayload(payload) {
				try {
					return JSON.parse(payload);
				} catch (_error) {
					return null;
				}
			}
			function rpcResponsePayload(parsed) {
				if (parsed?.method === "sessions.workspace_overview" && parsed?.params?.key === sessionKey) {
					return overviewPayload;
				}
				if (parsed?.method === "machines.list") {
					return machinesPayload;
				}
				return undefined;
			}
			function resolvePendingRpc(parsed, payload) {
				const responsePayload = rpcResponsePayload(parsed);
				if (responsePayload === undefined) {
					return window.__workspaceOverviewOrigSend(payload);
				}
				const responder = state.pending[parsed.id];
				if (responder) {
					responder({ ok: true, payload: responsePayload });
					delete state.pending[parsed.id];
				}
				return undefined;
			}

			if (!window.__workspaceOverviewOrigSend) {
				window.__workspaceOverviewOrigSend = state.ws.send.bind(state.ws);
			}
			state.ws.send = (payload) => {
				const parsed = parseRpcPayload(payload);
				if (!parsed) return window.__workspaceOverviewOrigSend(payload);
				return resolvePendingRpc(parsed, payload);
			};

			sessionModule.upsert({
				key: sessionKey,
				label: "E2E workspace session",
				model: "",
				createdAt: Date.now(),
				updatedAt: Date.now(),
				messageCount: 0,
				lastSeenMessageCount: 0,
				projectId: "workspace-e2e",
				workspace: "workspace-e2e",
				workspaceLabel: "E2E Workspace",
				sandbox_enabled: false,
				sandbox_image: null,
				worktree_branch: "",
				channelBinding: null,
				activeChannel: false,
				parentSessionKey: null,
				forkPoint: null,
				mcpDisabled: false,
				preview: "",
				archived: false,
				agent_id: "main",
				agentId: "main",
				node_id: null,
				surface: "web",
				sessionKind: "web",
				executionRoute: "local",
				machine: overviewPayload.machine,
				externalAgentSource: "native",
				version: 2,
			});
			sessionModule.setActive(sessionKey);
			sessionModule.notify();
		});
		await openChatMoreModal(page);
		const chatMoreModal = page.locator("#chatMoreModal");

		await expect(chatMoreModal.getByText("Workspace: E2E Workspace", { exact: true })).toBeVisible();
		await expect(chatMoreModal.getByText("Route: Local", { exact: true }).first()).toBeVisible();
		await expect(chatMoreModal.getByText("Preferred machine: Sandbox", { exact: true })).toBeVisible();
		await expect(chatMoreModal.getByText("Machine Posture", { exact: true })).toBeVisible();
		await expect(chatMoreModal.getByText("Trust", { exact: true })).toBeVisible();
		await expect(chatMoreModal.getByText("Trusted Local", { exact: true }).first()).toBeVisible();
		await expect(chatMoreModal.getByText("Available Machines", { exact: true })).toBeVisible();
		await expect(chatMoreModal.getByText("Build box", { exact: true })).toBeVisible();
		await expect(chatMoreModal.getByText("Stale telemetry", { exact: true })).toBeVisible();
		expect(pageErrors).toEqual([]);
	});
});
