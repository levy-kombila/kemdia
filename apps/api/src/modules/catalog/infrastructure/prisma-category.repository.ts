import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service.js";
import { createCategory, type Category } from "../domain/category.js";
import type { CategoryRepository } from "../application/ports.js";

@Injectable()
export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });
    return rows.map((row) =>
      createCategory({
        id: row.id,
        slug: row.slug,
        name: row.name,
        parentId: row.parentId,
        icon: row.icon,
        image: row.image,
        position: row.position,
      }),
    );
  }

  async save(category: Category): Promise<void> {
    const data = {
      slug: category.slug,
      name: category.name,
      parentId: category.parentId,
      icon: category.icon,
      image: category.image,
      position: category.position,
    };
    await this.prisma.category.upsert({
      where: { id: category.id },
      create: { id: category.id, ...data },
      update: data,
    });
  }
}
