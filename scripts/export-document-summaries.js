const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const documents = await prisma.document.findMany({
    select: { id: true, summary: true },
    orderBy: { id: "asc" },
  });
  process.stdout.write(JSON.stringify(documents));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
