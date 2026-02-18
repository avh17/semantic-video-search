/* eslint-disable */
/**
 * Generated data model types.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { DataModelFromSchemaDefinition } from "convex/server";
import type schema from "../schema.js";

/**
 * The names of all of your Convex tables.
 */
export type TableNames = "users" | "creators" | "videos" | "transcripts";

/**
 * The type of a document stored in Convex.
 */
export type DataModel = DataModelFromSchemaDefinition<typeof schema>;

/**
 * An identifier for a document in Convex.
 *
 * Convex documents are uniquely identified by their `Id`, which is accessible
 * on the `_id` field. To learn more, see [Document IDs](https://docs.convex.dev/using/document-ids).
 *
 * Documents can be loaded using `db.get(id)` in query and mutation functions.
 *
 * IDs are just strings at runtime, but this type can be used to distinguish IDs
 * from other strings and to type-check the table name they point to.
 */
export type Id<TableName extends TableNames> =
  import("convex/values").GenericId<TableName>;
