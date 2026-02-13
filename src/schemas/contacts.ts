import { z } from "zod";
import { BaseParams, ListParams, WriteParams } from "./common.js";

/**
 * Reusable sub-schema for email address input (contacts use flat structure).
 */
export const EmailAddressInput = z.object({
  name: z.string().optional().describe("Display name"),
  address: z.string().min(1).describe("Email address"),
});

/**
 * Reusable sub-schema for physical addresses.
 */
export const PhysicalAddress = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  countryOrRegion: z.string().optional(),
  postalCode: z.string().optional(),
});

export const ListContactsParams = ListParams.extend({
  folder_id: z.string().optional().describe("Contact folder ID. Default: default contacts folder"),
  filter: z.string().optional().describe("OData $filter expression"),
  orderby: z.string().optional().describe("OData $orderby expression. Default: displayName asc"),
});

export type ListContactsParamsType = z.infer<typeof ListContactsParams>;

export const GetContactParams = BaseParams.extend({
  contact_id: z.string().min(1).describe("ID of the contact"),
});

export type GetContactParamsType = z.infer<typeof GetContactParams>;

export const SearchContactsParams = ListParams.extend({
  query: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "Search query for full-text search across contact fields (name, email, company, etc.)",
    ),
});

export type SearchContactsParamsType = z.infer<typeof SearchContactsParams>;

const contactFields = {
  given_name: z.string().optional().describe("First name"),
  surname: z.string().optional().describe("Last name"),
  display_name: z.string().optional().describe("Display name"),
  email_addresses: z.array(EmailAddressInput).optional().describe("Email addresses"),
  business_phones: z.array(z.string()).optional().describe("Business phone numbers"),
  mobile_phone: z.string().optional().describe("Mobile phone number"),
  company_name: z.string().optional().describe("Company name"),
  job_title: z.string().optional().describe("Job title"),
  department: z.string().optional().describe("Department"),
  office_location: z.string().optional().describe("Office location"),
  business_address: PhysicalAddress.optional().describe("Business address"),
  home_address: PhysicalAddress.optional().describe("Home address"),
  birthday: z.string().optional().describe("Birthday (ISO 8601 date, e.g. '1990-01-15')"),
  personal_notes: z.string().optional().describe("Personal notes"),
  categories: z.array(z.string()).optional().describe("Contact categories"),
};

export const CreateContactParams = WriteParams.extend(contactFields);

export type CreateContactParamsType = z.infer<typeof CreateContactParams>;

export const UpdateContactParams = WriteParams.extend({
  contact_id: z.string().min(1).describe("ID of the contact to update"),
  ...contactFields,
});

export type UpdateContactParamsType = z.infer<typeof UpdateContactParams>;

export const DeleteContactParams = WriteParams.extend({
  contact_id: z.string().min(1).describe("ID of the contact to delete"),
});

export type DeleteContactParamsType = z.infer<typeof DeleteContactParams>;

export const ListContactFoldersParams = ListParams;

export type ListContactFoldersParamsType = z.infer<typeof ListContactFoldersParams>;
