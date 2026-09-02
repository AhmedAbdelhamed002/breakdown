import { listStrategies } from "./strategyService";
import { listAllStrategyKpiRefs } from "./strategyKpiService";
import { listAllTactics } from "./tacticService";
import { listAllPocs } from "./pocService";
import { listSourcedTasks } from "./taskService";
import type { Strategy } from "../models/strategy";
import type { ExecTask } from "../models/execTask";

export interface ExecItem {
  id: string;
  kind: "Tactic" | "Poc";
  name?: string;
  kpiId?: string;
  kpiName?: string;
  processId?: string;
  tasks: ExecTask[];
}

export interface ExecStrategyData {
  strategy: Strategy;
  items: ExecItem[];
  taskCount: number;
  lastTaskCreated?: string;
}

/**
 * The whole join, done once: Strategy -> its Strategy-KPI junctions -> the
 * Tactics/POCs attached to those junctions -> the `hx_tasks` rows broken
 * down from each. The generated SDK has no server-side `$expand`, so this
 * is client-side joining across separate list calls (unavoidable, not a
 * port of the legacy's "load everything" anti-pattern by choice).
 */
export async function loadExecutionData(): Promise<ExecStrategyData[]> {
  const [strategies, strategyKpiRefs, tactics, pocs, tasks] = await Promise.all([
    listStrategies(),
    listAllStrategyKpiRefs(),
    listAllTactics(),
    listAllPocs(),
    listSourcedTasks(),
  ]);

  const strategyIdByStrategyKpiId = new Map(strategyKpiRefs.map((r) => [r.id, r.strategyId]));
  const kpiIdByStrategyKpiId = new Map(strategyKpiRefs.map((r) => [r.id, r.kpiId]));
  const tasksByTactic = new Map<string, ExecTask[]>();
  const tasksByPoc = new Map<string, ExecTask[]>();
  for (const t of tasks) {
    if (t.sourceTacticId) tasksByTactic.set(t.sourceTacticId, [...(tasksByTactic.get(t.sourceTacticId) ?? []), t]);
    if (t.sourcePocId) tasksByPoc.set(t.sourcePocId, [...(tasksByPoc.get(t.sourcePocId) ?? []), t]);
  }

  const itemsByStrategy = new Map<string, ExecItem[]>();
  for (const t of tactics) {
    const strategyId = strategyIdByStrategyKpiId.get(t.strategyKpiId);
    if (!strategyId) continue;
    const list = itemsByStrategy.get(strategyId) ?? [];
    list.push({
      id: t.id,
      kind: "Tactic",
      name: t.name,
      kpiId: kpiIdByStrategyKpiId.get(t.strategyKpiId),
      kpiName: t.strategyKpiName,
      processId: t.processId,
      tasks: tasksByTactic.get(t.id) ?? [],
    });
    itemsByStrategy.set(strategyId, list);
  }
  for (const p of pocs) {
    const strategyId = strategyIdByStrategyKpiId.get(p.strategyKpiId);
    if (!strategyId) continue;
    const list = itemsByStrategy.get(strategyId) ?? [];
    list.push({
      id: p.id,
      kind: "Poc",
      name: p.name,
      kpiId: kpiIdByStrategyKpiId.get(p.strategyKpiId),
      kpiName: p.strategyKpiName,
      tasks: tasksByPoc.get(p.id) ?? [],
    });
    itemsByStrategy.set(strategyId, list);
  }

  return strategies.map((strategy) => {
    const items = itemsByStrategy.get(strategy.id) ?? [];
    const allTasks = items.flatMap((i) => i.tasks);
    const createdDates = allTasks.map((t) => t.createdOn).filter((d): d is string => !!d).sort();
    const lastTaskCreated = createdDates[createdDates.length - 1];
    return { strategy, items, taskCount: allTasks.length, lastTaskCreated };
  });
}
