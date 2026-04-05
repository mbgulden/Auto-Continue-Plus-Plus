import * as vscode from 'vscode';
import { SwarmOrchestrator } from '../engine/SwarmOrchestrator';
import { StateManager } from '../state/StateManager';
import { BoltOnRegistry } from '../boltons/BoltOnRegistry';
import { BudgetManager } from '../engine/BudgetManager';
import { SwarmWebview } from '../ui/SwarmWebview';
import { checkGlobalTOS } from '../utils/tos';

export function registerSpawnSwarmCommand(
    context: vscode.ExtensionContext,
    swarmOrchestrator: SwarmOrchestrator,
    stateManager: StateManager,
    boltOnRegistry: BoltOnRegistry,
    budgetManager: BudgetManager
): vscode.Disposable {
    const spawnCmd = vscode.commands.registerCommand('auto-continue.swarm.spawnDelegates', async () => {
        const agreed = await checkGlobalTOS(context);
        if (!agreed) {
            vscode.window.showErrorMessage('You must agree to the Terms of Service to use the Swarm.');
            return;
        }
        SwarmWebview.createOrShow(swarmOrchestrator, stateManager, boltOnRegistry, budgetManager);
    });

    const headlessCmd = vscode.commands.registerCommand('auto-continue.swarm.dispatchHeadless', async (prompt: string, useJules: boolean = false) => {
        const agreed = await checkGlobalTOS(context);
        if (!agreed) return;
        if (prompt) {
            await swarmOrchestrator.dispatchHeadlessMegaprompt(prompt, useJules);
        }
    });

    return vscode.Disposable.from(spawnCmd, headlessCmd);
}
