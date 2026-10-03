import type { StartedTestContainer } from "testcontainers";
import { afterAll, afterEach } from "vitest";

/**
 * Registers unconditional teardown for containers started inside tests.
 *
 * Wrap every `.start()` result with the returned `trackContainer` function.
 * Tracked containers are stopped after each test (and again after the file as
 * a safety net), whether the test passed, failed an assertion, or threw.
 * A container that never started is simply never tracked, so nothing breaks.
 */
export const useContainerCleanup = () => {
  const startedContainers: StartedTestContainer[] = [];

  const stopAllAsync = async () => {
    const containers = startedContainers.splice(0);
    const results = await Promise.allSettled(containers.map((container) => container.stop()));
    for (const result of results) {
      if (result.status === "rejected") {
        console.warn("Failed to stop test container", result.reason);
      }
    }
  };

  afterEach(stopAllAsync);
  afterAll(stopAllAsync);

  return <TContainer extends StartedTestContainer>(container: TContainer): TContainer => {
    startedContainers.push(container);
    return container;
  };
};
