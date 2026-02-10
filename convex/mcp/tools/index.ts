import { accountTools } from "./accounts";
import { contactTools } from "./contacts";
import { opportunityTools } from "./opportunities";
import { taskTools } from "./tasks";
import { reminderTools } from "./reminders";
import { searchTools } from "./search";
import { adminTools } from "./admin";

export const allTools = [
  ...accountTools,
  ...contactTools,
  ...opportunityTools,
  ...taskTools,
  ...reminderTools,
  ...searchTools,
  ...adminTools,
];

export {
  accountTools,
  contactTools,
  opportunityTools,
  taskTools,
  reminderTools,
  searchTools,
  adminTools,
};
