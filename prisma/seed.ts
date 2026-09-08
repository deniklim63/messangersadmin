import "dotenv/config";
import { ingestContact } from "../src/lib/contacts";
import { prisma } from "../src/lib/db";

/** Демо-данные, чтобы посмотреть админку до подключения настоящих ботов. */
async function main() {
  const telegram = await prisma.bot.upsert({
    where: { id: "demo-telegram" },
    update: {},
    create: { id: "demo-telegram", platform: "TELEGRAM", title: "Демо TG", username: "demo_bot" },
  });
  const vk = await prisma.bot.upsert({
    where: { id: "demo-vk" },
    update: {},
    create: { id: "demo-vk", platform: "VK", title: "Демо ВК", vkGroupId: "1000001" },
  });

  const people = [
    { name: "Иван Петров", phone: "+79991234567", email: "ivan@mail.ru", city: "Москва" },
    { name: "Мария Кузнецова", phone: "89261112233", email: "maria@gmail.com", city: "Санкт-Петербург" },
    { name: "Олег Смирнов", phone: "+79051112244", email: null, city: "Казань" },
    { name: "Анна Ким", phone: null, email: "anna@ya.ru", city: "Москва" },
    { name: "Пётр Соколов", phone: "+79161119988", email: "petr@mail.ru", city: "Новосибирск" },
  ];

  for (const [index, person] of people.entries()) {
    await ingestContact({
      botId: telegram.id,
      externalId: `tg-${index + 1}`,
      username: `user${index + 1}`,
      ...person,
    });
  }

  // Двое из них написали ещё и в ВК — по телефону записи склеятся в одного человека.
  await ingestContact({
    botId: vk.id,
    externalId: "vk-1",
    name: "Иван Петров",
    phone: "8 999 123 45 67",
    city: "Москва",
  });
  await ingestContact({
    botId: vk.id,
    externalId: "vk-2",
    email: "maria@gmail.com",
    city: "Санкт-Петербург",
  });
  await ingestContact({
    botId: vk.id,
    externalId: "vk-3",
    name: "Дарья Волкова",
    phone: "+79997776655",
    city: "Казань",
  });

  const total = await prisma.contact.count();
  console.log(`Готово. Людей в базе: ${total}`);
}

main().finally(() => prisma.$disconnect());
