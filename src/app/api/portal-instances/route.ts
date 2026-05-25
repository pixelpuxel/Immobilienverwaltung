import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, hashPassword, requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().optional(),
  slug: z.string().optional(),
  ownerName: z.string().optional(),
  ownerEmail: z.string().optional(),
  ownerUsername: z.string().optional(),
  ownerPassword: z.string().optional()
});

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user?.platformAdmin) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const instances = await prisma.portalInstance.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      users: {
        where: { role: Role.ADMIN, active: true },
        select: { id: true, email: true, username: true, name: true },
        orderBy: { createdAt: "asc" },
        take: 1
      },
      _count: { select: { users: true, properties: true, documents: true, templates: true } }
    }
  });
  return NextResponse.json(instances);
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "CSRF-Schutz hat die Anfrage blockiert." }, { status: 403 });
  const user = await requireApiUser(request, [Role.ADMIN]);
  if (!user?.platformAdmin) return NextResponse.json({ error: "Nicht erlaubt." }, { status: 403 });
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Bitte die Eingaben pruefen.", issues: body.error.issues }, { status: 400 });

  const name = body.data.name?.trim() || "Neue Portal-Instanz";
  const baseSlug = slugify(body.data.slug || name) || `instanz-${Date.now().toString(36)}`;
  const slug = await uniqueSlug(baseSlug);
  const ownerName = body.data.ownerName?.trim() || "Eigentümer";
  const username = cleanUsername(body.data.ownerUsername) || await uniqueUsername(`${slug}-eigentuemer`);
  const ownerEmail = body.data.ownerEmail?.trim().toLowerCase() || "";
  const email = ownerEmail.includes("@") ? ownerEmail : `${username}@portal.local`;
  const password = body.data.ownerPassword && body.data.ownerPassword.length >= 8 ? body.data.ownerPassword : "BitteSofortAendern123!";
  const existingUser = await prisma.user.findFirst({ where: { OR: [{ email }, ...(username ? [{ username }] : [])] } });
  if (existingUser) return NextResponse.json({ error: "Eigentümer-E-Mail oder Benutzername ist bereits vergeben." }, { status: 400 });

  const instance = await prisma.portalInstance.create({
    data: {
      name,
      slug,
      users: {
        create: {
          email,
          username,
          name: ownerName,
          contactPerson: ownerName,
          contactEmail: email,
          role: Role.ADMIN,
          active: true,
          passwordHash: await hashPassword(password)
        }
      }
    },
    include: { users: true, _count: { select: { users: true, properties: true, documents: true, templates: true } } }
  });

  return NextResponse.json(instance, { status: 201 });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanUsername(value?: string) {
  const username = slugify(value || "");
  return username || null;
}

async function uniqueSlug(base: string) {
  let slug = base;
  let index = 2;
  while (await prisma.portalInstance.findUnique({ where: { slug } })) {
    slug = `${base}-${index}`;
    index += 1;
  }
  return slug;
}

async function uniqueUsername(base: string) {
  let username = slugify(base) || `eigentuemer-${Date.now().toString(36)}`;
  let candidate = username;
  let index = 2;
  while (await prisma.user.findFirst({ where: { username: candidate } })) {
    candidate = `${username}-${index}`;
    index += 1;
  }
  return candidate;
}
