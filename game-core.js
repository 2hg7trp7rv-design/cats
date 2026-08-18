(function attachCatsTowerCore(root) {
  'use strict';

  const Data = root.CatsTowerData;
  if (!Data) {
    throw new Error('CatsTowerData must be loaded before game-core.js');
  }

  const { BALANCE, ENEMIES, ENEMY_ROTATION, UPGRADES } = Data;
  const MAX_NUMBER = 1e300;
  const MAX_LEVEL = 10000;
  const MAX_FLOOR = 100000;
  const UNIT_LANES = Object.freeze([0.27, 0.5, 0.73, 0.38, 0.62]);

  function currentTime() {
    return Date.now();
  }

  function finiteNumber(value, fallback, minimum = -MAX_NUMBER, maximum = MAX_NUMBER) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, number));
  }

  function integer(value, fallback, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
    return Math.floor(finiteNumber(value, fallback, minimum, maximum));
  }

  function positiveTimestamp(value, fallback) {
    return integer(value, fallback, 0, Number.MAX_SAFE_INTEGER);
  }

  function uniqueStrings(value, fallback) {
    if (!Array.isArray(value)) return [...fallback];
    return [...new Set(value.filter(item => typeof item === 'string' && item.length <= 80))];
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function addMemory(state, id) {
    if (!state.memories.includes(id)) {
      state.memories.push(id);
      state.memoryNew = true;
      return true;
    }
    return false;
  }

  function createFreshState(now = currentTime()) {
    const timestamp = positiveTimestamp(now, currentTime());
    return {
      version: Data.VERSION,
      gameplaySchema: Data.GAMEPLAY_SCHEMA,
      coins: BALANCE.startingCoins,
      fish: BALANCE.startingFish,
      currentFloor: 1,
      bestFloor: 1,
      checkpointFloor: 1,
      runFloorPeak: 1,
      enemyFloor: 1,
      enemyHp: null,
      wallElapsedMs: 0,
      mugiLevel: 1,
      weaponLevel: 1,
      dispatchLevel: 1,
      restaurantLevel: 0,
      roomLevel: 0,
      restaurantUnlocked: false,
      roomUnlocked: false,
      dawnShards: 0,
      lifetimeShards: 0,
      ascensions: 0,
      firstNightCleared: false,
      tutorialStep: 'dispatch',
      specialization: null,
      mugiMood: 82,
      memories: ['arrival'],
      memoryNew: true,
      totalKills: 0,
      totalTaps: 0,
      lifetimeCoins: 0,
      runCoinsEarned: 0,
      offlineCoinsEarned: 0,
      playTimeMs: 0,
      runStartedAt: timestamp,
      lastSeen: timestamp,
      hasPlayed: false,
      sound: true,
      migratedFromSchema: null,
      legacyFirstNightDone: false,
    };
  }

  function migrateSchema1(input, now = currentTime()) {
    const source = input && typeof input === 'object' ? input : {};
    const state = createFreshState(now);
    state.coins = finiteNumber(source.coins, state.coins, 0, MAX_NUMBER);
    state.fish = integer(source.stock, state.fish, 0, 999999);
    state.mugiMood = finiteNumber(source.mugiMood, state.mugiMood, 0, 100);
    state.specialization = ['street', 'bistro'].includes(source.specialization)
      ? source.specialization
      : null;
    state.memories = uniqueStrings(source.memories, state.memories);
    if (!state.memories.includes('arrival')) state.memories.unshift('arrival');
    state.memoryNew = source.memoryNew !== false;
    state.lastSeen = positiveTimestamp(source.lastSeen, state.lastSeen);
    state.hasPlayed = Boolean(source.hasPlayed);
    state.sound = source.sound !== false;
    state.legacyFirstNightDone = Boolean(source.firstNightDone);
    if (state.legacyFirstNightDone && !state.memories.includes('legacy-first-night')) {
      state.memories.push('legacy-first-night');
    }
    state.lifetimeCoins = Math.max(
      state.coins,
      finiteNumber(source.sales, 0, 0, MAX_NUMBER) * 14,
    );
    state.migratedFromSchema = 1;
    return state;
  }

  function migrateLegacyV01(input, now = currentTime()) {
    const source = input && typeof input === 'object' ? { ...input } : {};
    if (!Number.isFinite(Number(source.stock)) && Array.isArray(source.floors)) {
      const food = source.floors.find(floor => floor && floor.type === 'food');
      if (food) source.stock = food.stock;
    }
    const state = migrateSchema1(source, now);
    state.migratedFromSchema = 0.1;
    return state;
  }

  function normalizeSchema2(input, now = currentTime()) {
    const source = input && typeof input === 'object' ? input : {};
    const state = createFreshState(now);

    state.coins = finiteNumber(source.coins, state.coins, 0, MAX_NUMBER);
    state.fish = integer(source.fish, state.fish, 0, 999999);
    state.currentFloor = integer(source.currentFloor, 1, 1, MAX_FLOOR);
    state.bestFloor = integer(source.bestFloor, state.currentFloor, 1, MAX_FLOOR);
    state.bestFloor = Math.max(state.bestFloor, state.currentFloor);
    state.checkpointFloor = integer(source.checkpointFloor, 1, 1, state.bestFloor);
    state.runFloorPeak = integer(source.runFloorPeak, state.currentFloor, 1, MAX_FLOOR);
    state.runFloorPeak = Math.max(state.runFloorPeak, state.currentFloor);
    state.enemyFloor = integer(source.enemyFloor, state.currentFloor, 1, MAX_FLOOR);
    state.enemyHp = source.enemyHp === null || source.enemyHp === undefined
      ? null
      : finiteNumber(source.enemyHp, null, 0, MAX_NUMBER);
    if (state.enemyFloor !== state.currentFloor) {
      state.enemyFloor = state.currentFloor;
      state.enemyHp = null;
    }
    state.wallElapsedMs = state.currentFloor === BALANCE.wallFloor
      ? finiteNumber(source.wallElapsedMs, 0, 0, BALANCE.wallObserveMs)
      : 0;

    state.mugiLevel = integer(source.mugiLevel, 1, 1, MAX_LEVEL);
    state.weaponLevel = integer(source.weaponLevel, 1, 1, MAX_LEVEL);
    state.dispatchLevel = integer(source.dispatchLevel, 1, 1, MAX_LEVEL);
    state.restaurantLevel = integer(source.restaurantLevel, 0, 0, MAX_LEVEL);
    state.roomLevel = integer(source.roomLevel, 0, 0, MAX_LEVEL);
    state.restaurantUnlocked = Boolean(source.restaurantUnlocked)
      || state.currentFloor >= BALANCE.restaurantUnlockFloor
      || state.runFloorPeak >= BALANCE.restaurantUnlockFloor;
    state.roomUnlocked = Boolean(source.roomUnlocked)
      || state.bestFloor >= BALANCE.roomUnlockFloor;
    if (state.restaurantUnlocked && state.restaurantLevel < 1) state.restaurantLevel = 1;
    if (state.roomUnlocked && state.roomLevel < 1) state.roomLevel = 1;

    state.dawnShards = finiteNumber(source.dawnShards, 0, 0, MAX_NUMBER);
    state.lifetimeShards = finiteNumber(source.lifetimeShards, 0, 0, MAX_NUMBER);
    state.lifetimeShards = Math.max(state.lifetimeShards, state.dawnShards);
    state.ascensions = integer(source.ascensions, 0, 0, Number.MAX_SAFE_INTEGER);
    state.firstNightCleared = Boolean(source.firstNightCleared);
    state.tutorialStep = typeof source.tutorialStep === 'string'
      ? source.tutorialStep.slice(0, 80)
      : state.tutorialStep;
    state.specialization = ['street', 'bistro'].includes(source.specialization)
      ? source.specialization
      : null;
    state.mugiMood = finiteNumber(source.mugiMood, state.mugiMood, 0, 100);
    state.memories = uniqueStrings(source.memories, state.memories);
    if (!state.memories.includes('arrival')) state.memories.unshift('arrival');
    state.memoryNew = source.memoryNew !== false;

    state.totalKills = integer(source.totalKills, 0, 0, Number.MAX_SAFE_INTEGER);
    state.totalTaps = integer(source.totalTaps, 0, 0, Number.MAX_SAFE_INTEGER);
    state.lifetimeCoins = finiteNumber(source.lifetimeCoins, 0, 0, MAX_NUMBER);
    state.runCoinsEarned = finiteNumber(source.runCoinsEarned, 0, 0, MAX_NUMBER);
    state.offlineCoinsEarned = finiteNumber(source.offlineCoinsEarned, 0, 0, MAX_NUMBER);
    state.playTimeMs = integer(source.playTimeMs, 0, 0, Number.MAX_SAFE_INTEGER);
    state.runStartedAt = positiveTimestamp(source.runStartedAt, state.runStartedAt);
    state.lastSeen = positiveTimestamp(source.lastSeen, state.lastSeen);
    state.hasPlayed = Boolean(source.hasPlayed);
    state.sound = source.sound !== false;
    state.migratedFromSchema = source.migratedFromSchema === null
      ? null
      : finiteNumber(source.migratedFromSchema, null, 0, Data.GAMEPLAY_SCHEMA);
    state.legacyFirstNightDone = Boolean(source.legacyFirstNightDone);
    state.version = Data.VERSION;
    state.gameplaySchema = Data.GAMEPLAY_SCHEMA;
    return state;
  }

  function normalizeState(input, now = currentTime()) {
    if (!input || typeof input !== 'object') return createFreshState(now);
    const schema = Number(input.gameplaySchema);
    if (schema > Data.GAMEPLAY_SCHEMA) return normalizeSchema2(input, now);
    if (schema !== Data.GAMEPLAY_SCHEMA) {
      return migrateSchema1(input, now);
    }
    return normalizeSchema2(input, now);
  }

  function decodeJson(raw) {
    if (raw && typeof raw === 'object') return { value: raw, corrupt: false };
    if (typeof raw !== 'string' || !raw.trim()) return { value: null, corrupt: false };
    try {
      return { value: JSON.parse(raw), corrupt: false };
    } catch {
      return { value: null, corrupt: true };
    }
  }

  function restoreState(primaryRaw, legacyRaw, now = currentTime()) {
    const primary = decodeJson(primaryRaw);
    if (primary.value) {
      const schema = Number(primary.value.gameplaySchema);
      if (schema > Data.GAMEPLAY_SCHEMA) {
        return {
          state: normalizeSchema2(primary.value, now),
          source: 'future-schema',
          migrated: false,
          corrupt: false,
          unsupportedSchema: schema,
        };
      }
      const migrated = Number(primary.value.gameplaySchema) !== Data.GAMEPLAY_SCHEMA;
      return {
        state: normalizeState(primary.value, now),
        source: migrated ? 'schema1' : 'schema2',
        migrated,
        corrupt: false,
      };
    }

    const legacy = decodeJson(legacyRaw);
    if (legacy.value) {
      return {
        state: migrateLegacyV01(legacy.value, now),
        source: 'legacy-v01',
        migrated: true,
        corrupt: primary.corrupt,
      };
    }

    return {
      state: createFreshState(now),
      source: 'fresh',
      migrated: false,
      corrupt: primary.corrupt || legacy.corrupt,
    };
  }

  function deserializeState(raw, now = currentTime()) {
    return restoreState(raw, null, now).state;
  }

  function enemyDefinitionForFloor(floor) {
    if (floor % BALANCE.firstBossFloor === 0) return ENEMIES.boss;
    const id = ENEMY_ROTATION[(floor - 1) % ENEMY_ROTATION.length];
    return ENEMIES[id] || ENEMIES.crow;
  }

  function computeEnemyStats(floorValue) {
    const floor = integer(floorValue, 1, 1, MAX_FLOOR);
    const definition = enemyDefinitionForFloor(floor);
    const isBoss = definition.kind === 'boss';
    const isMiniBoss = !isBoss && floor % 5 === 0;
    const isWall = floor === BALANCE.wallFloor;
    let hpMultiplier = definition.hpMultiplier;
    if (isBoss) hpMultiplier *= BALANCE.enemyBossMultiplier;
    else if (isMiniBoss) hpMultiplier *= BALANCE.enemyMiniBossMultiplier;
    if (isWall) hpMultiplier *= BALANCE.wallHpMultiplier;

    const maxHp = BALANCE.enemyBaseHp
      * Math.pow(BALANCE.enemyHpFloorFactor, floor - 1)
      * hpMultiplier;
    const attack = BALANCE.enemyBaseAttack
      * Math.pow(BALANCE.enemyAttackFloorFactor, floor - 1)
      * definition.attackMultiplier;
    const reward = BALANCE.baseKillReward
      * Math.pow(BALANCE.killRewardFloorFactor, floor - 1)
      * definition.rewardMultiplier;

    return {
      id: definition.id,
      name: definition.name,
      kind: definition.kind,
      floor,
      isBoss,
      isMiniBoss,
      isWall,
      maxHp,
      attack,
      attackIntervalMs: BALANCE.enemyAttackIntervalMs,
      reward,
      regenPerSecond: isWall ? maxHp * BALANCE.enemyWallRegenPerSecond : 0,
    };
  }

  function createEnemy(state) {
    const stats = computeEnemyStats(state.currentFloor);
    const restoredHp = state.enemyFloor === state.currentFloor && state.enemyHp !== null
      ? finiteNumber(state.enemyHp, stats.maxHp, 0, stats.maxHp)
      : stats.maxHp;
    return {
      ...stats,
      hp: restoredHp,
      attackCooldownMs: stats.attackIntervalMs,
      elapsedMs: 0,
    };
  }

  function permanentMultiplier(state, extraShards = 0) {
    const lifetimeShards = finiteNumber(state.lifetimeShards, 0, 0, MAX_NUMBER)
      + finiteNumber(extraShards, 0, 0, MAX_NUMBER);
    const roomLevels = Math.max(0, integer(state.roomLevel, 0, 0, MAX_LEVEL) - 1);
    return 1
      + lifetimeShards * BALANCE.permanentPowerPerShard
      + roomLevels * BALANCE.roomPowerPerLevel;
  }

  function computeDispatchInterval(state) {
    const level = integer(state.dispatchLevel, 1, 1, MAX_LEVEL);
    const roomFactor = 1 + Math.max(0, state.roomLevel - 1) * 0.025;
    return Math.max(
      BALANCE.autoDispatchMinimumMs,
      BALANCE.autoDispatchBaseMs
        * Math.pow(BALANCE.autoDispatchLevelFactor, level - 1)
        / roomFactor,
    );
  }

  function computeCatStats(state, kind = 'mugi') {
    const helper = kind === 'helper';
    const permanent = permanentMultiplier(state);
    const restaurantFactor = 1
      + Math.max(0, state.restaurantLevel - 1) * BALANCE.restaurantAttackPerLevel;
    const styleAttackFactor = state.specialization === 'bistro' ? 1.13 : 1;
    const styleSpeedFactor = state.specialization === 'street' ? 0.9 : 1;
    const attack = BALANCE.baseCatAttack
      * Math.pow(BALANCE.mugiAttackLevelFactor, state.mugiLevel - 1)
      * Math.pow(BALANCE.weaponLevelFactor, state.weaponLevel - 1)
      * permanent
      * restaurantFactor
      * styleAttackFactor
      * (helper ? BALANCE.helperAttackFactor : 1);
    const maxHp = BALANCE.baseCatHp
      * Math.pow(BALANCE.mugiHpLevelFactor, state.mugiLevel - 1)
      * permanent
      * (helper ? BALANCE.helperHpFactor : 1);
    const travelMs = BALANCE.unitTravelBaseMs * (helper ? 1.04 : 1);
    return {
      kind,
      attack,
      maxHp,
      travelMs,
      attackIntervalMs: BALANCE.unitAttackIntervalMs * styleSpeedFactor,
    };
  }

  function coinsPerHit(state, floor) {
    const base = Math.max(1, Math.ceil(floor / 3));
    const restaurantFactor = 1
      + Math.max(0, state.restaurantLevel - 1) * BALANCE.restaurantIncomePerLevel;
    return Math.max(1, Math.floor(base * restaurantFactor));
  }

  function createMetrics() {
    return {
      totalElapsedMs: 0,
      totalAutoDispatches: 0,
      totalManualDispatches: 0,
      totalAttacks: 0,
      totalEnemyAttacks: 0,
      totalUnitsDefeated: 0,
      totalKills: 0,
      totalFloorsCleared: 0,
      totalCoinsEarned: 0,
      totalUpgradesBought: 0,
      totalDawns: 0,
      peakUnits: 0,
      floorReachTimes: { 1: 0 },
      lastFloorClearMs: null,
    };
  }

  function createRuntime(stateInput) {
    const state = Number(stateInput?.gameplaySchema) === Data.GAMEPLAY_SCHEMA
      ? stateInput
      : normalizeState(stateInput);
    const runtime = {
      elapsedMs: 0,
      carryMs: 0,
      nextUnitId: 1,
      units: [],
      enemy: createEnemy(state),
      autoDispatchCooldownMs: 0,
      manualDispatchCooldownMs: 0,
      transitionRemainingMs: 0,
      enemyElapsedMs: state.currentFloor === BALANCE.wallFloor
        ? finiteNumber(state.wallElapsedMs, 0, 0, BALANCE.wallObserveMs)
        : 0,
      autoDispatches: 0,
      manualDispatches: 0,
      kills: 0,
      atWall: false,
      phase: 'climbing',
      events: [],
      metrics: createMetrics(),
    };
    syncEnemyState(state, runtime);
    updateWallAndPhase(state, runtime);
    return runtime;
  }

  function syncEnemyState(state, runtime) {
    state.enemyFloor = state.currentFloor;
    state.enemyHp = runtime.enemy ? runtime.enemy.hp : null;
    state.wallElapsedMs = state.currentFloor === BALANCE.wallFloor
      ? Math.min(BALANCE.wallObserveMs, Math.max(0, runtime.enemyElapsedMs))
      : 0;
  }

  function pushEvent(runtime, type, payload = {}) {
    runtime.events.push({ type, atMs: runtime.elapsedMs, ...payload });
    if (runtime.events.length > 240) runtime.events.splice(0, runtime.events.length - 240);
  }

  function drainEvents(runtime) {
    const events = runtime.events.map(event => ({ ...event }));
    runtime.events.length = 0;
    return events;
  }

  function hasMugi(runtime) {
    return runtime.units.some(unit => unit.kind === 'mugi');
  }

  function spawnCat(state, runtime, source = 'auto') {
    if (!runtime || !Array.isArray(runtime.units)) {
      return { ok: false, reason: 'invalid-runtime' };
    }
    if (runtime.units.length >= BALANCE.unitCap) {
      return { ok: false, reason: 'unit-cap' };
    }

    const kind = hasMugi(runtime) ? 'helper' : 'mugi';
    const stats = computeCatStats(state, kind);
    const id = runtime.nextUnitId++;
    const unit = {
      id,
      kind,
      source,
      lane: UNIT_LANES[(id - 1) % UNIT_LANES.length],
      phase: 'moving',
      progress: 0,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      attack: stats.attack,
      travelMs: stats.travelMs,
      attackIntervalMs: stats.attackIntervalMs,
      attackCooldownMs: 0,
      bornAtMs: runtime.elapsedMs,
    };
    runtime.units.push(unit);
    if (source === 'manual') {
      runtime.manualDispatches += 1;
      runtime.metrics.totalManualDispatches += 1;
    } else {
      runtime.autoDispatches += 1;
      runtime.metrics.totalAutoDispatches += 1;
    }
    runtime.metrics.peakUnits = Math.max(runtime.metrics.peakUnits, runtime.units.length);
    pushEvent(runtime, 'unit-spawned', { unitId: id, kind, source, lane: unit.lane });
    return { ok: true, unit: clone(unit) };
  }

  function dispatchCat(state, runtime) {
    if (runtime.manualDispatchCooldownMs > 0) {
      return {
        ok: false,
        reason: 'cooldown',
        remainingMs: runtime.manualDispatchCooldownMs,
      };
    }
    const result = spawnCat(state, runtime, 'manual');
    if (!result.ok) return result;
    runtime.manualDispatchCooldownMs = BALANCE.manualDispatchCooldownMs;
    state.totalTaps += 1;
    if (state.tutorialStep === 'dispatch') state.tutorialStep = 'upgrade';
    return result;
  }

  function getUpgradeCost(state, id) {
    const definition = UPGRADES[id];
    if (!definition) return Infinity;
    if (definition.unlockFloor && state.bestFloor < definition.unlockFloor) return Infinity;
    if (id === 'restaurant' && !state.restaurantUnlocked) return Infinity;
    if (id === 'room' && !state.roomUnlocked) return Infinity;
    const level = integer(state[definition.stateField], definition.minimumLevel, 0, MAX_LEVEL);
    const exponent = Math.max(0, level - definition.minimumLevel);
    return Math.max(1, Math.floor(definition.baseCost * Math.pow(definition.costFactor, exponent)));
  }

  function refreshUnitStats(state, runtime) {
    for (const unit of runtime.units) {
      const previousMax = Math.max(1, unit.maxHp);
      const healthRatio = Math.max(0, Math.min(1, unit.hp / previousMax));
      const stats = computeCatStats(state, unit.kind);
      unit.attack = stats.attack;
      unit.maxHp = stats.maxHp;
      unit.hp = Math.max(1, stats.maxHp * healthRatio);
      unit.travelMs = stats.travelMs;
      unit.attackIntervalMs = stats.attackIntervalMs;
      unit.attackCooldownMs = Math.min(unit.attackCooldownMs, unit.attackIntervalMs);
    }
  }

  function buyUpgrade(state, runtime, id) {
    const definition = UPGRADES[id];
    if (!definition) return { ok: false, reason: 'unknown-upgrade', id };
    const cost = getUpgradeCost(state, id);
    if (!Number.isFinite(cost)) return { ok: false, reason: 'locked', id };
    const balance = finiteNumber(state[definition.currency], 0, 0, MAX_NUMBER);
    if (balance < cost) {
      return {
        ok: false,
        reason: 'insufficient-funds',
        id,
        currency: definition.currency,
        cost,
        balance,
      };
    }

    const before = integer(state[definition.stateField], definition.minimumLevel, 0, MAX_LEVEL);
    state[definition.currency] = balance - cost;
    state[definition.stateField] = Math.min(MAX_LEVEL, before + 1);
    runtime.metrics.totalUpgradesBought += 1;
    if (id === 'dispatch') {
      runtime.autoDispatchCooldownMs = Math.min(
        runtime.autoDispatchCooldownMs,
        computeDispatchInterval(state),
      );
    }
    refreshUnitStats(state, runtime);
    pushEvent(runtime, 'upgrade-bought', {
      id,
      level: state[definition.stateField],
      currency: definition.currency,
      cost,
    });
    return {
      ok: true,
      id,
      currency: definition.currency,
      cost,
      before,
      after: state[definition.stateField],
    };
  }

  function setSpecialization(state, runtime, style) {
    if (!['street', 'bistro'].includes(style)) {
      return { ok: false, reason: 'invalid-specialization' };
    }
    if (state.specialization) {
      return { ok: false, reason: 'already-specialized', style: state.specialization };
    }
    state.specialization = style;
    refreshUnitStats(state, runtime);
    pushEvent(runtime, 'specialization-selected', { style });
    return { ok: true, style };
  }

  function addCoins(state, runtime, amount, source) {
    const value = finiteNumber(amount, 0, 0, MAX_NUMBER);
    if (value <= 0) return 0;
    state.coins = Math.min(MAX_NUMBER, state.coins + value);
    state.lifetimeCoins = Math.min(MAX_NUMBER, state.lifetimeCoins + value);
    state.runCoinsEarned = Math.min(MAX_NUMBER, state.runCoinsEarned + value);
    runtime.metrics.totalCoinsEarned = Math.min(
      MAX_NUMBER,
      runtime.metrics.totalCoinsEarned + value,
    );
    if (source) pushEvent(runtime, 'coins-earned', { amount: value, source });
    return value;
  }

  function unlockFloorNodes(state, runtime) {
    if (!state.restaurantUnlocked && state.currentFloor >= BALANCE.restaurantUnlockFloor) {
      state.restaurantUnlocked = true;
      state.restaurantLevel = Math.max(1, state.restaurantLevel);
      addMemory(state, 'restaurant-open');
      pushEvent(runtime, 'support-unlocked', {
        id: 'restaurant',
        floor: BALANCE.restaurantUnlockFloor,
      });
    }
    if (!state.roomUnlocked && state.currentFloor >= BALANCE.roomUnlockFloor) {
      state.roomUnlocked = true;
      state.roomLevel = Math.max(1, state.roomLevel);
      state.checkpointFloor = BALANCE.roomUnlockFloor;
      addMemory(state, 'room-open');
      pushEvent(runtime, 'support-unlocked', {
        id: 'room',
        floor: BALANCE.roomUnlockFloor,
      });
    }
  }

  function defeatEnemy(state, runtime) {
    const defeated = runtime.enemy;
    const clearedFloor = state.currentFloor;
    const restaurantIncome = 1
      + Math.max(0, state.restaurantLevel - 1) * BALANCE.restaurantIncomePerLevel;
    const reward = Math.max(1, Math.floor(defeated.reward * restaurantIncome));
    addCoins(state, runtime, reward, 'kill');

    runtime.kills += 1;
    runtime.metrics.totalKills += 1;
    runtime.metrics.totalFloorsCleared += 1;
    runtime.metrics.lastFloorClearMs = runtime.elapsedMs;
    state.totalKills += 1;
    state.currentFloor = Math.min(MAX_FLOOR, state.currentFloor + 1);
    state.bestFloor = Math.max(state.bestFloor, state.currentFloor);
    state.runFloorPeak = Math.max(state.runFloorPeak, state.currentFloor);
    runtime.metrics.floorReachTimes[state.currentFloor] = runtime.elapsedMs;

    if (clearedFloor === BALANCE.firstBossFloor) {
      state.firstNightCleared = true;
      addCoins(state, runtime, BALANCE.firstNightRewardCoins, 'first-boss');
      addMemory(state, 'first-night');
    }

    unlockFloorNodes(state, runtime);
    pushEvent(runtime, 'floor-cleared', {
      floor: clearedFloor,
      nextFloor: state.currentFloor,
      enemyId: defeated.id,
      reward,
      boss: defeated.isBoss,
    });

    runtime.enemy = createEnemy(state);
    runtime.enemyElapsedMs = 0;
    runtime.atWall = false;
    runtime.transitionRemainingMs = BALANCE.floorTransitionMs;
    runtime.phase = 'transition';
    for (const unit of runtime.units) {
      unit.phase = 'moving';
      unit.progress = Math.min(0.18, unit.progress * 0.16);
      unit.attackCooldownMs = 0;
    }
    syncEnemyState(state, runtime);
  }

  function chooseEnemyTarget(runtime) {
    let target = null;
    for (const unit of runtime.units) {
      if (unit.phase !== 'attacking') continue;
      if (!target || unit.progress > target.progress || (
        unit.progress === target.progress && unit.id < target.id
      )) {
        target = unit;
      }
    }
    return target;
  }

  function removeDefeatedUnits(runtime) {
    const survivors = [];
    for (const unit of runtime.units) {
      if (unit.hp > 0) {
        survivors.push(unit);
        continue;
      }
      runtime.metrics.totalUnitsDefeated += 1;
      pushEvent(runtime, 'unit-defeated', { unitId: unit.id, kind: unit.kind });
    }
    runtime.units = survivors;
  }

  function livePartyDps(runtime) {
    return runtime.units.reduce((total, unit) => {
      if (unit.phase !== 'attacking') return total;
      return total + unit.attack * 1000 / unit.attackIntervalMs;
    }, 0);
  }

  function updateWallAndPhase(state, runtime) {
    runtime.atWall = state.currentFloor === BALANCE.wallFloor
      && runtime.enemyElapsedMs >= BALANCE.wallObserveMs
      && runtime.enemy.hp > 0;
    if (runtime.transitionRemainingMs > 0) runtime.phase = 'transition';
    else if (runtime.atWall) runtime.phase = 'wall';
    else if (runtime.units.some(unit => unit.phase === 'attacking')) runtime.phase = 'fighting';
    else runtime.phase = 'climbing';
  }

  function simulateStep(state, runtime, stepMs) {
    runtime.elapsedMs += stepMs;
    runtime.metrics.totalElapsedMs += stepMs;
    state.playTimeMs = Math.min(Number.MAX_SAFE_INTEGER, state.playTimeMs + stepMs);
    runtime.manualDispatchCooldownMs = Math.max(0, runtime.manualDispatchCooldownMs - stepMs);

    if (runtime.transitionRemainingMs > 0) {
      runtime.transitionRemainingMs = Math.max(0, runtime.transitionRemainingMs - stepMs);
      updateWallAndPhase(state, runtime);
      return;
    }

    runtime.autoDispatchCooldownMs -= stepMs;
    if (runtime.autoDispatchCooldownMs <= 0) {
      const interval = computeDispatchInterval(state);
      if (runtime.units.length < BALANCE.unitCap) {
        spawnCat(state, runtime, 'auto');
        runtime.autoDispatchCooldownMs += interval;
      } else {
        runtime.autoDispatchCooldownMs = Math.min(250, interval);
      }
    }

    runtime.enemyElapsedMs += stepMs;
    runtime.enemy.elapsedMs += stepMs;

    for (const unit of runtime.units) {
      if (unit.phase === 'moving') {
        unit.progress = Math.min(1, unit.progress + stepMs / unit.travelMs);
        if (unit.progress >= 1) {
          unit.phase = 'attacking';
          unit.attackCooldownMs = 0;
          pushEvent(runtime, 'unit-engaged', { unitId: unit.id, kind: unit.kind });
        }
      }
    }

    for (const unit of runtime.units) {
      if (unit.phase !== 'attacking' || runtime.enemy.hp <= 0) continue;
      unit.attackCooldownMs -= stepMs;
      while (unit.attackCooldownMs <= 0 && runtime.enemy.hp > 0) {
        const damage = Math.min(runtime.enemy.hp, unit.attack);
        runtime.enemy.hp = Math.max(0, runtime.enemy.hp - unit.attack);
        unit.attackCooldownMs += unit.attackIntervalMs;
        runtime.metrics.totalAttacks += 1;
        const hitCoins = coinsPerHit(state, state.currentFloor);
        addCoins(state, runtime, hitCoins, null);
        pushEvent(runtime, 'cat-hit', {
          unitId: unit.id,
          kind: unit.kind,
          enemyId: runtime.enemy.id,
          damage,
          coins: hitCoins,
          enemyHp: runtime.enemy.hp,
        });
        if (runtime.enemy.hp <= 0) {
          defeatEnemy(state, runtime);
          updateWallAndPhase(state, runtime);
          return;
        }
      }
    }

    if (runtime.enemy.regenPerSecond > 0 && runtime.enemy.hp > 0) {
      runtime.enemy.hp = Math.min(
        runtime.enemy.maxHp,
        runtime.enemy.hp + runtime.enemy.regenPerSecond * stepMs / 1000,
      );
    }

    const target = chooseEnemyTarget(runtime);
    if (target) {
      runtime.enemy.attackCooldownMs -= stepMs;
      while (runtime.enemy.attackCooldownMs <= 0 && target.hp > 0) {
        const damage = Math.min(target.hp, runtime.enemy.attack);
        target.hp = Math.max(0, target.hp - runtime.enemy.attack);
        runtime.enemy.attackCooldownMs += runtime.enemy.attackIntervalMs;
        runtime.metrics.totalEnemyAttacks += 1;
        pushEvent(runtime, 'enemy-hit', {
          enemyId: runtime.enemy.id,
          unitId: target.id,
          damage,
          unitHp: target.hp,
        });
      }
      if (target.hp <= 0) removeDefeatedUnits(runtime);
    } else {
      runtime.enemy.attackCooldownMs = Math.min(
        runtime.enemy.attackCooldownMs,
        runtime.enemy.attackIntervalMs,
      );
    }

    syncEnemyState(state, runtime);
    updateWallAndPhase(state, runtime);
  }

  function getMetrics(state, runtime) {
    return {
      partyDps: livePartyDps(runtime),
      dispatchIntervalMs: computeDispatchInterval(state),
      permanentMultiplier: permanentMultiplier(state),
      enemyRegenPerSecond: runtime.enemy.regenPerSecond,
      currentFloor: state.currentFloor,
      bestFloor: state.bestFloor,
      runElapsedMs: runtime.elapsedMs,
      runCoinsEarned: state.runCoinsEarned,
      ...clone(runtime.metrics),
    };
  }

  function summarizeRuntime(state, runtime) {
    return {
      elapsedMs: runtime.elapsedMs,
      unitCount: runtime.units.length,
      autoDispatches: runtime.autoDispatches,
      manualDispatches: runtime.manualDispatches,
      kills: runtime.kills,
      enemyHp: runtime.enemy.hp,
      enemyMaxHp: runtime.enemy.maxHp,
      atWall: runtime.atWall,
      phase: runtime.phase,
      currentFloor: state.currentFloor,
      floorTransitionMs: runtime.transitionRemainingMs,
      autoDispatchCooldownMs: runtime.autoDispatchCooldownMs,
      manualDispatchCooldownMs: runtime.manualDispatchCooldownMs,
    };
  }

  function snapshotRuntime(state, runtime) {
    return {
      ...summarizeRuntime(state, runtime),
      units: runtime.units.map(unit => ({ ...unit })),
      enemy: { ...runtime.enemy },
      metrics: getMetrics(state, runtime),
      events: runtime.events.map(event => ({ ...event })),
    };
  }

  function simulate(state, runtime, milliseconds) {
    const requestedMs = finiteNumber(milliseconds, 0, 0, MAX_NUMBER);
    const simulatedRequestMs = Math.min(requestedMs, BALANCE.maxAdvanceMs);
    runtime.carryMs += simulatedRequestMs;
    let simulatedMs = 0;
    while (runtime.carryMs >= BALANCE.fixedStepMs) {
      simulateStep(state, runtime, BALANCE.fixedStepMs);
      runtime.carryMs -= BALANCE.fixedStepMs;
      simulatedMs += BALANCE.fixedStepMs;
    }
    syncEnemyState(state, runtime);
    updateWallAndPhase(state, runtime);
    return {
      requestedMs,
      simulatedMs,
      truncated: requestedMs > BALANCE.maxAdvanceMs,
      state: clone(state),
      runtime: summarizeRuntime(state, runtime),
      metrics: getMetrics(state, runtime),
    };
  }

  function calculateDawnReward(state) {
    const peak = Math.max(state.currentFloor, state.runFloorPeak);
    if (peak < BALANCE.dawnUnlockFloor) return 0;
    const progressReward = 1 + Math.floor((peak - BALANCE.dawnUnlockFloor) / 2);
    const bossReward = Math.floor((peak - 1) / BALANCE.firstBossFloor);
    return Math.max(1, progressReward + bossReward);
  }

  function previewDawn(state) {
    const reward = calculateDawnReward(state);
    const beforeMultiplier = permanentMultiplier(state);
    const afterMultiplier = permanentMultiplier(state, reward);
    return {
      available: reward > 0,
      reward,
      unlockFloor: BALANCE.dawnUnlockFloor,
      multiplierBefore: beforeMultiplier,
      multiplierAfter: afterMultiplier,
      lost: [
        { id: 'floor', label: '現在階', value: state.currentFloor, nextValue: 1 },
        { id: 'coins', label: '所持コイン', value: state.coins, nextValue: BALANCE.startingCoins },
        { id: 'fish', label: 'ラン内の魚', value: state.fish, nextValue: BALANCE.startingFish },
        { id: 'mugi-level', label: 'ムギの特訓', value: state.mugiLevel, nextValue: 1 },
        { id: 'weapon-level', label: '猫パンチ', value: state.weaponLevel, nextValue: 1 },
        { id: 'dispatch-level', label: '出撃口', value: state.dispatchLevel, nextValue: 1 },
        { id: 'restaurant-level', label: '食堂のラン内強化', value: state.restaurantLevel, nextValue: 0 },
        { id: 'restaurant-unlock', label: '食堂の解放', value: state.restaurantUnlocked ? 'OPEN' : 'LOCKED', nextValue: 'LOCKED' },
      ],
      kept: [
        { id: 'best-floor', label: '最高階', value: state.bestFloor },
        { id: 'room-level', label: '共同部屋', value: state.roomLevel },
        { id: 'memories', label: '思い出', value: state.memories.length },
        { id: 'specialization', label: '食堂の方向', value: state.specialization },
      ],
      gained: [
        { id: 'dawn-shards', label: '夜明けのかけら', value: reward },
        {
          id: 'permanent-power',
          label: '恒久強化',
          value: afterMultiplier - beforeMultiplier,
          nextValue: afterMultiplier,
        },
      ],
    };
  }

  function resetRuntimeForDawn(state, runtime) {
    const previousMetrics = runtime.metrics;
    const totalDawns = previousMetrics.totalDawns + 1;
    const replacement = createRuntime(state);
    replacement.metrics = {
      ...previousMetrics,
      totalDawns,
      floorReachTimes: { 1: 0 },
      lastFloorClearMs: null,
    };
    replacement.events = [];
    for (const key of Object.keys(runtime)) delete runtime[key];
    Object.assign(runtime, replacement);
  }

  function performDawn(state, runtime) {
    const preview = previewDawn(state);
    if (!preview.available) {
      return { ok: false, reason: 'locked', preview };
    }

    const reward = preview.reward;
    state.dawnShards = Math.min(MAX_NUMBER, state.dawnShards + reward);
    state.lifetimeShards = Math.min(MAX_NUMBER, state.lifetimeShards + reward);
    state.ascensions += 1;
    state.coins = BALANCE.startingCoins;
    state.fish = BALANCE.startingFish;
    state.currentFloor = 1;
    state.checkpointFloor = 1;
    state.runFloorPeak = 1;
    state.enemyFloor = 1;
    state.enemyHp = null;
    state.wallElapsedMs = 0;
    state.mugiLevel = 1;
    state.weaponLevel = 1;
    state.dispatchLevel = 1;
    state.restaurantLevel = 0;
    state.restaurantUnlocked = false;
    state.runCoinsEarned = 0;
    state.runStartedAt = state.lastSeen;
    state.tutorialStep = 'replay';
    addMemory(state, 'first-dawn');

    resetRuntimeForDawn(state, runtime);
    pushEvent(runtime, 'dawn-complete', {
      reward,
      ascensions: state.ascensions,
      permanentMultiplier: permanentMultiplier(state),
    });
    return {
      ok: true,
      reward,
      preview,
      state: clone(state),
      runtime: summarizeRuntime(state, runtime),
    };
  }

  function estimateOfflineCoinsPerSecond(state) {
    const floorFactor = 0.16 + Math.max(1, state.bestFloor) * 0.075;
    const restaurantFactor = 1
      + Math.max(0, state.restaurantLevel - 1) * BALANCE.restaurantIncomePerLevel;
    const dawnFactor = Math.sqrt(permanentMultiplier(state));
    return floorFactor * restaurantFactor * dawnFactor;
  }

  function applyOfflineProgress(state, elapsedMilliseconds, now = null) {
    const requestedMs = finiteNumber(elapsedMilliseconds, 0, 0, MAX_NUMBER);
    const appliedMs = Math.min(requestedMs, BALANCE.offlineCapMs);
    const wholeSeconds = Math.floor(appliedMs / 1000);
    const rate = estimateOfflineCoinsPerSecond(state);
    const coinsEarned = wholeSeconds < 5 ? 0 : Math.floor(wholeSeconds * rate);
    if (coinsEarned > 0) {
      state.coins = Math.min(MAX_NUMBER, state.coins + coinsEarned);
      state.lifetimeCoins = Math.min(MAX_NUMBER, state.lifetimeCoins + coinsEarned);
      state.runCoinsEarned = Math.min(MAX_NUMBER, state.runCoinsEarned + coinsEarned);
      state.offlineCoinsEarned = Math.min(
        MAX_NUMBER,
        state.offlineCoinsEarned + coinsEarned,
      );
    }
    if (now !== null) state.lastSeen = positiveTimestamp(now, state.lastSeen);
    return {
      requestedMs,
      appliedMs,
      capped: requestedMs > BALANCE.offlineCapMs,
      seconds: wholeSeconds,
      rate,
      coinsEarned,
      floorsAdvanced: 0,
    };
  }

  function serializeState(state, runtime = null, now = null) {
    if (runtime) syncEnemyState(state, runtime);
    if (now !== null) state.lastSeen = positiveTimestamp(now, state.lastSeen);
    return JSON.stringify(normalizeSchema2(state, state.lastSeen));
  }

  function createEngine(initialState = null, options = {}) {
    const now = options.now ?? currentTime();
    let state = normalizeState(initialState || createFreshState(now), now);
    let runtime = createRuntime(state);

    function reseed(patch = {}, seedNow = now) {
      state = normalizeSchema2({
        ...createFreshState(seedNow),
        ...(patch || {}),
        version: Data.VERSION,
        gameplaySchema: Data.GAMEPLAY_SCHEMA,
      }, seedNow);
      runtime = createRuntime(state);
      return clone(state);
    }

    return {
      get state() {
        return state;
      },
      get runtime() {
        return runtime;
      },
      getState() {
        return clone(state);
      },
      getRuntime() {
        return snapshotRuntime(state, runtime);
      },
      getRuntimeSummary() {
        return summarizeRuntime(state, runtime);
      },
      getMetrics() {
        return getMetrics(state, runtime);
      },
      advance(milliseconds) {
        return simulate(state, runtime, milliseconds);
      },
      simulate(milliseconds) {
        return simulate(state, runtime, milliseconds);
      },
      dispatch() {
        return dispatchCat(state, runtime);
      },
      upgrade(id) {
        return buyUpgrade(state, runtime, id);
      },
      specialize(style) {
        return setSpecialization(state, runtime, style);
      },
      previewDawn() {
        return previewDawn(state);
      },
      dawn() {
        return performDawn(state, runtime);
      },
      applyOffline(elapsedMilliseconds, offlineNow = null) {
        return applyOfflineProgress(state, elapsedMilliseconds, offlineNow);
      },
      drainEvents() {
        return drainEvents(runtime);
      },
      serialize(saveNow = null) {
        return serializeState(state, runtime, saveNow);
      },
      seed(patch = {}, seedNow = now) {
        return reseed(patch, seedNow);
      },
      reset(resetNow = now) {
        return reseed({}, resetNow);
      },
    };
  }

  root.CatsTowerCore = Object.freeze({
    createFreshState,
    normalizeState,
    migrateSchema1,
    migrateLegacyV01,
    restoreState,
    deserializeState,
    serializeState,
    enemyDefinitionForFloor,
    computeEnemyStats,
    createEnemy,
    permanentMultiplier,
    computeDispatchInterval,
    computeCatStats,
    coinsPerHit,
    createRuntime,
    summarizeRuntime,
    snapshotRuntime,
    getMetrics,
    drainEvents,
    spawnCat,
    dispatchCat,
    getUpgradeCost,
    buyUpgrade,
    setSpecialization,
    simulate,
    calculateDawnReward,
    previewDawn,
    performDawn,
    estimateOfflineCoinsPerSecond,
    applyOfflineProgress,
    createEngine,
  });
})(typeof window !== 'undefined' ? window : globalThis);
