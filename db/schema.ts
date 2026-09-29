import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
export const tracks = sqliteTable('tracks', {
 id: text('id').primaryKey(), owner: text('owner').notNull(), title: text('title').notNull(),
 mime: text('mime').notNull(), size: integer('size').notNull(), duration: real('duration').notNull(),
 created: integer('created').notNull(), expires: integer('expires').notNull()
}, t => [index('idx_tracks_owner_created').on(t.owner,t.created),index('idx_tracks_expires').on(t.expires)]);
