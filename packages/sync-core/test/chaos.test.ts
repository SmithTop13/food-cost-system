import { describe, expect, it } from "vitest";
import { BranchSimulation } from "./sim.js";

const SEEDS = Number(process.env["CHAOS_SEEDS"] ?? 100);
const CHAOS_MS = 60_000;
const QUIESCE_MS = 30_000;

describe(`chaos: ${SEEDS} seeded dinner services with crashes, partitions, packet loss and internet outages`, () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    it(`seed ${seed}: no lost or duplicate events, all devices and the cloud converge`, async () => {
      const sim = new BranchSimulation({ seed });
      sim.scheduleChaos(0, CHAOS_MS);
      await sim.runAsync(CHAOS_MS);

      sim.workload = false;
      sim.healAll();
      await sim.runAsync(CHAOS_MS + QUIESCE_MS);

      expect(sim.created.size).toBeGreaterThan(100);
      expect(sim.violations()).toEqual([]);
    });
  }
});

describe("failover", () => {
  it("a new hub takes over in under 10 seconds (target from the spec)", () => {
    const sim = new BranchSimulation({ seed: 42 });
    sim.run(10_000);
    const [oldHub] = sim.leaders();
    expect(oldHub?.id).toBe("pos1");

    sim.crash(oldHub!.id);
    const crashedAt = sim.now;
    while (sim.now < crashedAt + 20_000) {
      sim.run(sim.now + 10);
      const [hub] = sim.leaders();
      const followers = [...sim.nodes.values()].filter((n) => n !== hub && !sim.down.has(n.id));
      if (hub && followers.every((n) => n.leaderId === hub.id)) break;
    }
    const takeover = sim.now - crashedAt;
    expect(sim.leaders().map((n) => n.id)).toEqual(["pos2"]);
    expect(takeover).toBeLessThan(10_000);
    expect(takeover).toBeLessThan(2_500); // actual budget: 1.5 s timeout + one heartbeat
  });

  it("orders keep flowing between devices with the internet down for the whole service", () => {
    const sim = new BranchSimulation({ seed: 7 });
    sim.internetUp = false;
    sim.run(120_000);
    sim.workload = false;
    sim.run(125_000);
    const hub = sim.leaders()[0]!;
    expect(hub.entries().length).toBe(sim.created.size);
    expect(sim.cloud.entries()).toHaveLength(0);

    sim.internetUp = true; // back online: the cloud catches up
    sim.run(140_000);
    expect(sim.violations()).toEqual([]);
  });

  it("the original hub rejoins as a follower and resubmits what only it had", () => {
    const sim = new BranchSimulation({ seed: 11 });
    sim.run(5_000);
    // Cut pos1 (the hub) off together with waiter1; both keep taking orders.
    sim.partition([["pos1", "waiter1"], ["pos2", "kds1"]]);
    sim.run(20_000);
    expect(sim.leaders().map((n) => n.id).sort()).toEqual(["pos1", "pos2"]);
    // Both sides still reach the cloud; they must not fight over it with ever-higher terms.
    expect(sim.leaders().map((n) => n.leaderBallot!.term).sort()).toEqual([1, 2]);

    sim.workload = false;
    sim.partition([sim.devices]);
    sim.run(35_000);
    expect(sim.leaders().map((n) => n.id)).toEqual(["pos2"]);
    expect(sim.violations()).toEqual([]);
  });

  it("a hub adopts a newer term that a restarted device brings back, without waiting for the cloud", () => {
    // Regression for chaos seed 404 (1,000-seed run).
    const sim = new BranchSimulation({ seed: 404 });
    sim.run(5_000);
    sim.partition([["pos1", "waiter1", "kds1"], ["pos2"]]);
    sim.run(10_000); // pos2, alone, makes itself hub at term 2 and uploads to the cloud
    expect(sim.cloud.ballot).toEqual({ term: 2, rank: 1 });
    sim.crash("pos2");
    sim.partition([sim.devices]);
    sim.restart("pos2"); // comes back as a plain device that remembers term 2
    sim.workload = false;
    sim.run(15_000); // well under the 30 s cloud takeover wait
    const hub = sim.leaders()[0]!;
    expect(hub.id).toBe("pos1");
    expect(hub.leaderBallot!.term).toBeGreaterThan(2);
    expect(sim.violations()).toEqual([]);
  });

  it("a hub that dies for good is replaced even if no surviving device saw its term", () => {
    const sim = new BranchSimulation({ seed: 5 });
    sim.run(5_000);
    // pos1 (the hub) is cut off alone and stays hub of its side at term 1; the others elect
    // pos2 at term 2, which reaches the cloud. Then every device on pos2's side dies for good.
    sim.partition([["pos1"], ["pos2", "waiter1", "kds1"]]);
    sim.run(10_000);
    const lost = sim.leaders().find((n) => n.id === "pos2")!;
    expect(lost.leaderBallot!.term).toBe(2);
    for (const id of ["pos2", "waiter1", "kds1"]) sim.crash(id);
    sim.workload = false;
    sim.run(60_000);
    // pos1 only ever saw term 1, but the cloud saw term 2 go quiet: pos1 claims term 3 and the cloud follows it.
    expect(sim.node("pos1").leaderBallot!.term).toBe(3);
    expect(sim.cloud.isMirrorOf(sim.node("pos1").leaderBallot)).toBe(true);
  });
});
