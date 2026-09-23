import type { Provider, Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";

/** Resolve real collaborators through Nest DI while replacing external boundaries with test doubles. */
export async function createService<T>(
  service: Type<T>,
  overrides: Provider[],
  collaborators: Provider[] = []
): Promise<T> {
  const module = await createTestModule([...collaborators, service], overrides);

  return module.get(service);
}

export function createTestModule(providers: Provider[], overrides: Provider[]) {
  return Test.createTestingModule({
    providers: [...providers, ...overrides]
  }).compile();
}
