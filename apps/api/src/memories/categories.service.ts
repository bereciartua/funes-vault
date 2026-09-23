import { BadRequestException, Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Owns server taxonomy reads and category existence checks.
 * Tenant boundary: server taxonomy is shared; it contains no user-owned content.
 * Audit: read-only; no audit or provenance writes.
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}
  async assertExist(categoryKeys: string[]) {
    const uniqueCategoryKeys = [...new Set(categoryKeys)];

    if (uniqueCategoryKeys.length === 0) {
      return;
    }

    const categories = await this.prisma.client.memoryCategory.findMany({
      where: { key: { in: uniqueCategoryKeys } },
      select: { key: true }
    });
    const foundKeys = new Set(categories.map((category) => category.key));
    const missingKeys = uniqueCategoryKeys.filter((key) => !foundKeys.has(key));

    if (missingKeys.length > 0) {
      throw new BadRequestException(
        `Unknown memory categories: ${missingKeys.join(", ")}`
      );
    }
  }
}
