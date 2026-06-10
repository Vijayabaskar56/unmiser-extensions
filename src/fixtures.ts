import { parseSmsWithManifest } from "./engine";
import type { ManifestWithFixtures } from "./types";

export interface FixtureFailure {
  fixture: string;
  message: string;
}

export function validateManifestFixtures(bundle: ManifestWithFixtures): FixtureFailure[] {
  const failures: FixtureFailure[] = [];

  for (const fixture of bundle.fixtures) {
    const result = parseSmsWithManifest(bundle.manifest, {
      sender: fixture.sender,
      body: fixture.body,
      receivedAt: fixture.receivedAt,
    });

    if (result.confidence !== fixture.expected.confidence) {
      failures.push({
        fixture: fixture.name,
        message: `Expected confidence ${fixture.expected.confidence}, got ${result.confidence}`,
      });
    }

    for (const reason of fixture.expected.reasons ?? []) {
      if (!result.reasons.includes(reason)) {
        failures.push({
          fixture: fixture.name,
          message: `Expected reason ${reason}`,
        });
      }
    }

    for (const [field, expectedValue] of Object.entries(fixture.expected.fields ?? {})) {
      const actualValue = result.fields?.[field as keyof typeof result.fields];
      if (actualValue !== expectedValue) {
        failures.push({
          fixture: fixture.name,
          message: `Expected ${field}=${String(expectedValue)}, got ${String(actualValue)}`,
        });
      }
    }
  }

  return failures;
}
