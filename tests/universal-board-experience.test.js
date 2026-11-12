import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  CHARACTER_PROFILES,
  assignCharacter,
  characterSelectionComplete,
  diceTierForScore,
  minimumTurnsForSession,
  normalizeCharacterAssignments,
  turnRewardProfile,
} from "../public/prototypes/universal-board/experience-core.js";

test("the twenty Ximitu companions preserve old identities and have distinct art for each surface", () => {
  assert.equal(CHARACTER_PROFILES.length, 20);
  assert.deepEqual(
    CHARACTER_PROFILES.map(({ id }) => id),
    [
      "cowboy",
      "star-captain",
      "cloud-wizard",
      "lightning-ninja",
      "rainbow-pilot",
      "forest-scout",
      "inventor",
      "crystal-explorer",
      "pudding-puppy",
      "mochi-hamster",
      "bamboo-panda",
      "maple-red-panda",
      "sleepy-koala",
      "cotton-lamb",
      "honey-tiger",
      "sunshine-lion",
      "starlight-unicorn",
      "mint-dinosaur",
      "moon-raccoon",
      "chestnut-hedgehog",
    ],
  );
  assert.equal(
    CHARACTER_PROFILES.filter(({ castRole }) => castRole === "lead").length,
    1,
  );
  assert.equal(
    CHARACTER_PROFILES.filter(({ castRole }) => castRole === "friend").length,
    19,
  );
  assert.equal(CHARACTER_PROFILES[0].label, "西米兔");
  assert.equal(CHARACTER_PROFILES[0].species, "rabbit");
  assert.equal(
    new Set(CHARACTER_PROFILES.map(({ species }) => species)).size,
    20,
    "each friend must keep a clearly different species silhouette",
  );

  const variants = [
    {
      field: "selectionAssetRef",
      directory: "selection",
      width: 320,
      height: 400,
    },
    {
      field: "hudAssetRef",
      directory: "hud",
      width: 256,
      height: 256,
    },
    {
      field: "pawnAssetRef",
      directory: "pawns",
      width: 192,
      height: 256,
    },
  ];

  const crossVariantRefs = new Set();
  const crossVariantHashes = new Set();
  for (const variant of variants) {
    const refs = CHARACTER_PROFILES.map((profile) => profile[variant.field]);
    assert.equal(new Set(refs).size, 20);
    const hashes = new Set();

    CHARACTER_PROFILES.forEach((profile) => {
      const assetRef = profile[variant.field];
      assert.match(
        assetRef,
        new RegExp(
          `^/assets/characters/ximitu-friends/v3/${variant.directory}/[a-z-]+-v3\\.png$`,
        ),
      );
      const asset = readFileSync(new URL(
        `../public${assetRef}`,
        import.meta.url,
      ));
      assert.equal(asset.subarray(1, 4).toString("ascii"), "PNG");
      assert.equal(asset.readUInt32BE(16), variant.width);
      assert.equal(asset.readUInt32BE(20), variant.height);
      assert.equal(asset[25], 6, `${profile.id} ${variant.directory} art must remain RGBA`);
      const hash = createHash("sha256").update(asset).digest("hex");
      hashes.add(hash);
      crossVariantHashes.add(hash);
      crossVariantRefs.add(assetRef);
    });

    assert.equal(hashes.size, 20);
  }

  CHARACTER_PROFILES.forEach((profile) => {
    assert.ok(profile.roleLabel);
    assert.ok(profile.catchphrase);
    assert.ok(profile.accent);
  });
  assert.equal(crossVariantRefs.size, 60);
  assert.equal(crossVariantHashes.size, 60);
});

test("the expanded cast keeps eight classroom seats and restores legacy and new selections", () => {
  const oldIds = [
    "cowboy", "star-captain", "cloud-wizard", "lightning-ninja",
    "rainbow-pilot", "forest-scout", "inventor", "crystal-explorer",
  ];
  assert.deepEqual(normalizeCharacterAssignments(oldIds, 8), oldIds);
  const allIds = CHARACTER_PROFILES.map(({ id }) => id);
  assert.equal(normalizeCharacterAssignments(allIds, 20).length, 8);
  for (const profile of CHARACTER_PROFILES) {
    const selected = assignCharacter([], { seatIndex: 0, characterId: profile.id, playerCount: 1 });
    assert.equal(characterSelectionComplete(selected, 1), true);
    assert.deepEqual(normalizeCharacterAssignments(JSON.parse(JSON.stringify(selected)), 1), selected);
  }
  const newCast = allIds.slice(-8);
  assert.equal(characterSelectionComplete(newCast, 8), true);
  assert.deepEqual(normalizeCharacterAssignments([...newCast, allIds[0]], 9), newCast);
  assert.throws(() => assignCharacter(newCast, {
    seatIndex: 8, characterId: allIds[0], playerCount: 20,
  }), /outside the active player range/);
});

test("each classroom seat must choose one unique character", () => {
  const first = assignCharacter([], {
    seatIndex: 0,
    characterId: CHARACTER_PROFILES[0].id,
    playerCount: 2,
  });
  const complete = assignCharacter(first, {
    seatIndex: 1,
    characterId: CHARACTER_PROFILES[1].id,
    playerCount: 2,
  });

  assert.equal(characterSelectionComplete(first, 2), false);
  assert.equal(characterSelectionComplete(complete, 2), true);
  assert.deepEqual(normalizeCharacterAssignments([
    CHARACTER_PROFILES[0].id,
    CHARACTER_PROFILES[0].id,
  ], 2), [CHARACTER_PROFILES[0].id, null]);
});

test("assigning a claimed character releases its previous seat", () => {
  const reassigned = assignCharacter([
    CHARACTER_PROFILES[0].id,
    CHARACTER_PROFILES[1].id,
  ], {
    seatIndex: 1,
    characterId: CHARACTER_PROFILES[0].id,
    playerCount: 2,
  });
  assert.deepEqual(reassigned, [null, CHARACTER_PROFILES[0].id]);
});

test("a classroom session always contains a meaningful minimum journey", () => {
  const expectedTurnsByPlayerCount = [12, 12, 12, 12, 15, 18, 21, 24];
  expectedTurnsByPlayerCount.forEach((expectedTurns, index) => {
    const playerCount = index + 1;
    assert.equal(minimumTurnsForSession({
      playerCount,
      teamCount: playerCount,
      minOpportunitiesPerSeat: 2,
    }), expectedTurns);
  });
});

test("real AI scores map generously to dice tiers while high scores unlock a choice", () => {
  const legendary = turnRewardProfile({
    resolution: "primary_accepted",
    aiScore: 88,
    missing: [],
  });
  assert.equal(legendary.score, 88);
  assert.equal(legendary.diceTier, "legendary");
  assert.equal(legendary.requiresChoice, true);
  assert.equal(legendary.coinDelta, 0);

  const brave = turnRewardProfile({
    resolution: "primary_accepted",
    aiScore: 72,
  });
  assert.equal(brave.diceTier, "brave");
  assert.deepEqual(brave.diceFaces, [1, 1, 1, 1, 2, 3]);
  assert.equal(brave.probabilitySummary, "5 面是 1–2 点 · 1 面是 3 点");
  assert.deepEqual(
    diceTierForScore(0).diceFaces,
    [1, 1, 1, 2, 2, 2],
  );
  assert.equal(diceTierForScore(0).probabilitySummary, "3 面是 1 点 · 3 面是 2 点");

  for (const [score, tier, requiresChoice] of [
    [0, "starter", false],
    [59, "starter", false],
    [60, "brave", false],
    [79, "brave", false],
    [80, "legendary", true],
    [100, "legendary", true],
  ]) {
    const mapped = diceTierForScore(score);
    assert.equal(mapped.id, tier, `${score} must map to ${tier}`);
    assert.equal(mapped.requiresChoice, requiresChoice);
  }
  assert.equal(diceTierForScore(null), null);
  assert.equal(turnRewardProfile({ result: "retry" }).score, null);
  assert.equal(turnRewardProfile({ result: "retry" }).diceTier, null);
  assert.equal(turnRewardProfile({ resolution: "primary_accepted" }).diceTier, null);
  const support = turnRewardProfile({ resolution: "teacher_pass" });
  assert.equal(support.diceTier, "support");
  assert.equal(support.coinDelta, 0);
  assert.deepEqual(support.diceFaces, [1, 2, 3, 3, 4, 4]);
  assert.equal(support.probabilitySummary, "两端均衡 · 3 点最常见");
});
