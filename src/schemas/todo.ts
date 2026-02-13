import { z } from "zod";
import { DateTimeTimeZone } from "./calendar-write.js";
import { BaseParams, ListParams, WriteParams } from "./common.js";

/**
 * Sub-schema for task body content.
 */
export const TaskBody = z.object({
  content: z.string().describe("Body content"),
  content_type: z.enum(["text", "html"]).default("text").describe("Body format: 'text' or 'html'"),
});

export const ListTodoListsParams = ListParams;

export type ListTodoListsParamsType = z.infer<typeof ListTodoListsParams>;

export const GetTodoListParams = BaseParams.extend({
  list_id: z.string().min(1).describe("ID of the To Do list"),
});

export type GetTodoListParamsType = z.infer<typeof GetTodoListParams>;

export const ListTasksParams = ListParams.extend({
  list_id: z.string().min(1).describe("ID of the To Do list"),
  filter: z
    .string()
    .optional()
    .describe("OData $filter expression, e.g. \"status eq 'notStarted'\""),
  orderby: z.string().optional().describe("OData $orderby expression"),
});

export type ListTasksParamsType = z.infer<typeof ListTasksParams>;

export const GetTaskParams = BaseParams.extend({
  list_id: z.string().min(1).describe("ID of the To Do list"),
  task_id: z.string().min(1).describe("ID of the task"),
});

export type GetTaskParamsType = z.infer<typeof GetTaskParams>;

const taskStatusEnum = z.enum([
  "notStarted",
  "inProgress",
  "completed",
  "waitingOnOthers",
  "deferred",
]);

const taskImportanceEnum = z.enum(["low", "normal", "high"]);

export const CreateTaskParams = WriteParams.extend({
  list_id: z.string().min(1).describe("ID of the To Do list"),
  title: z.string().min(1).describe("Task title"),
  body: TaskBody.optional().describe("Task body content"),
  due_date_time: DateTimeTimeZone.optional().describe("Due date/time with timezone"),
  reminder_date_time: DateTimeTimeZone.optional().describe("Reminder date/time with timezone"),
  start_date_time: DateTimeTimeZone.optional().describe("Start date/time with timezone"),
  importance: taskImportanceEnum.default("normal").describe("Task importance"),
  status: taskStatusEnum.default("notStarted").describe("Task status"),
  categories: z.array(z.string()).optional().describe("Task categories"),
  is_reminder_on: z.boolean().optional().describe("Enable reminder (requires reminder_date_time)"),
});

export type CreateTaskParamsType = z.infer<typeof CreateTaskParams>;

export const UpdateTaskParams = WriteParams.extend({
  list_id: z.string().min(1).describe("ID of the To Do list"),
  task_id: z.string().min(1).describe("ID of the task to update"),
  title: z.string().min(1).optional().describe("New title"),
  body: TaskBody.optional().describe("New body content"),
  due_date_time: DateTimeTimeZone.optional().describe("New due date/time"),
  reminder_date_time: DateTimeTimeZone.optional().describe("New reminder date/time"),
  start_date_time: DateTimeTimeZone.optional().describe("New start date/time"),
  importance: taskImportanceEnum.optional().describe("New importance"),
  status: taskStatusEnum.optional().describe("New status"),
  categories: z.array(z.string()).optional().describe("New categories"),
  is_reminder_on: z.boolean().optional().describe("Enable/disable reminder"),
});

export type UpdateTaskParamsType = z.infer<typeof UpdateTaskParams>;

export const DeleteTaskParams = WriteParams.extend({
  list_id: z.string().min(1).describe("ID of the To Do list"),
  task_id: z.string().min(1).describe("ID of the task to delete"),
});

export type DeleteTaskParamsType = z.infer<typeof DeleteTaskParams>;
