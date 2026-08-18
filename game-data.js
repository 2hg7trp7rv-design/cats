(function attachCatsTowerData(root) {
  'use strict';

  const VERSION = '0.8.1';
  const BUILD = 'v081-pixel-tower-r2';
  const GAMEPLAY_SCHEMA = 2;

  const BALANCE = Object.freeze({
    fixedStepMs: 100,
    maxAdvanceMs: 60 * 60 * 1000,
    offlineCapMs: 8 * 60 * 60 * 1000,
    unitCap: 12,
    startingCoins: 72,
    startingFish: 4,
    autoDispatchBaseMs: 2300,
    autoDispatchMinimumMs: 650,
    autoDispatchLevelFactor: 0.89,
    manualDispatchCooldownMs: 150,
    unitTravelBaseMs: 1150,
    unitAttackIntervalMs: 900,
    enemyAttackIntervalMs: 1250,
    floorTransitionMs: 360,
    wallFloor: 8,
    wallObserveMs: 10000,
    wallHpMultiplier: 6.5,
    dawnUnlockFloor: 8,
    restaurantUnlockFloor: 3,
    roomUnlockFloor: 5,
    firstBossFloor: 10,
    baseCatAttack: 5.2,
    baseCatHp: 24,
    helperAttackFactor: 0.72,
    helperHpFactor: 0.8,
    mugiAttackLevelFactor: 1.25,
    mugiHpLevelFactor: 1.2,
    weaponLevelFactor: 1.34,
    restaurantAttackPerLevel: 0.07,
    restaurantIncomePerLevel: 0.12,
    roomPowerPerLevel: 0.1,
    permanentPowerPerShard: 0.55,
    enemyBaseHp: 21,
    enemyHpFloorFactor: 1.82,
    enemyBaseAttack: 3.2,
    enemyAttackFloorFactor: 1.29,
    enemyMiniBossMultiplier: 2.1,
    enemyBossMultiplier: 3.4,
    enemyWallRegenPerSecond: 0.0035,
    baseKillReward: 9,
    killRewardFloorFactor: 1.42,
    firstNightRewardCoins: 120,
  });

  const ART = Object.freeze({
    title: '/assets/v080/pixel-r2/tower-night-r2.png',
    tower: '/assets/v080/pixel-r2/tower-night-r2.png',
    mugiSprites: '/assets/v080/pixel-r2/mugi-sprites-r2.png',
    crowSprites: '/assets/v080/pixel-r2/crow-sprites-r2.png',
  });

  const ENEMIES = Object.freeze({
    crow: Object.freeze({
      id: 'crow',
      name: '夜ガラス',
      kind: 'normal',
      hpMultiplier: 1,
      attackMultiplier: 1,
      rewardMultiplier: 1,
    }),
    boss: Object.freeze({
      id: 'great-crow',
      name: 'クロバネ',
      kind: 'boss',
      hpMultiplier: 1,
      attackMultiplier: 1.16,
      rewardMultiplier: 1.55,
      art: ART.crowSprites,
    }),
  });

  const ENEMY_ROTATION = Object.freeze(['crow']);

  const FLOOR_NODES = Object.freeze({
    restaurant: Object.freeze({
      id: 'restaurant',
      floor: BALANCE.restaurantUnlockFloor,
      name: 'さかな食堂',
      description: '制圧した階から、攻撃とコイン獲得を支援する。',
    }),
    room: Object.freeze({
      id: 'room',
      floor: BALANCE.roomUnlockFloor,
      name: '猫の共同部屋',
      description: '夜明けを越えて残る、猫たちの恒久強化拠点。',
    }),
  });

  const UPGRADES = Object.freeze({
    mugi: Object.freeze({
      id: 'mugi',
      stateField: 'mugiLevel',
      name: 'ムギの特訓',
      currency: 'coins',
      baseCost: 34,
      costFactor: 1.52,
      minimumLevel: 1,
    }),
    weapon: Object.freeze({
      id: 'weapon',
      stateField: 'weaponLevel',
      name: '猫パンチ',
      currency: 'coins',
      baseCost: 45,
      costFactor: 1.57,
      minimumLevel: 1,
    }),
    dispatch: Object.freeze({
      id: 'dispatch',
      stateField: 'dispatchLevel',
      name: '出撃口',
      currency: 'coins',
      baseCost: 58,
      costFactor: 1.62,
      minimumLevel: 1,
    }),
    restaurant: Object.freeze({
      id: 'restaurant',
      stateField: 'restaurantLevel',
      name: 'さかな食堂',
      currency: 'coins',
      baseCost: 76,
      costFactor: 1.68,
      minimumLevel: 1,
      unlockFloor: BALANCE.restaurantUnlockFloor,
    }),
    room: Object.freeze({
      id: 'room',
      stateField: 'roomLevel',
      name: '共同部屋',
      currency: 'dawnShards',
      baseCost: 1,
      costFactor: 1.85,
      minimumLevel: 1,
      unlockFloor: BALANCE.roomUnlockFloor,
      permanent: true,
    }),
  });

  root.CatsTowerData = Object.freeze({
    VERSION,
    BUILD,
    GAMEPLAY_SCHEMA,
    SAVE_KEY: 'cats-tower-v080',
    LEGACY_KEY: 'cats-tower-v01',
    SCHEMA1_BACKUP_KEY: 'cats-tower-v080-schema1-backup',
    BALANCE,
    ART,
    ENEMIES,
    ENEMY_ROTATION,
    FLOOR_NODES,
    UPGRADES,
  });
})(typeof window !== 'undefined' ? window : globalThis);
