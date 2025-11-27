// utils/embedStore.js

/**
 * Expected MySQL table structure:
 *
 * CREATE TABLE embed_sections (
 *   id INT AUTO_INCREMENT PRIMARY KEY,
 *   category VARCHAR(50) NOT NULL,              -- e.g. 'rules', 'coc', 'information'
 *   section_number INT NOT NULL,                -- 1, 2, 3, ...
 *   title VARCHAR(255) NOT NULL,                -- embed title
 *   description TEXT NOT NULL,                  -- full raw embed description (multi-line allowed)
 *   color INT DEFAULT NULL,                     -- decimal color (e.g. 0x2b2d31 -> 2830193)
 *   footer VARCHAR(255) DEFAULT NULL,           -- optional footer text
 *   target_channel_id VARCHAR(32) DEFAULT NULL, -- channel to post in (optional)
 *   UNIQUE KEY uniq_category_section (category, section_number)
 * );
 */

/**
 * Get all sections for a given embed category.
 * Returns rows ordered by section_number, with section_number
 * exposed as `section_index` for backwards compatibility.
 *
 * @param {import("mysql2/promise").Pool} db
 * @param {string} category - e.g. "rules", "coc", "information"
 */
export async function getEmbedSections(db, category) {
  const [rows] = await db.query(
    `
    SELECT
      section_number AS section_index,
      title,
      description,
      color,
      footer,
      target_channel_id
    FROM embed_sections
    WHERE category = ?
    ORDER BY section_number ASC
    `,
    [category]
  );

  return rows;
}

/**
 * Get a single section by category + section_number.
 *
 * @param {import("mysql2/promise").Pool} db
 * @param {string} category
 * @param {number} sectionNumber
 */
export async function getEmbedSection(db, category, sectionNumber) {
  const [rows] = await db.query(
    `
    SELECT
      section_number AS section_index,
      title,
      description,
      color,
      footer,
      target_channel_id
    FROM embed_sections
    WHERE category = ? AND section_number = ?
    LIMIT 1
    `,
    [category, sectionNumber]
  );

  return rows[0] || null;
}

/**
 * Insert or update a section (UPSERT).
 * Text is stored EXACTLY as provided (no trimming or formatting).
 *
 * @param {import("mysql2/promise").Pool} db
 * @param {object} section
 * @param {string} section.category
 * @param {number} section.section_number
 * @param {string} section.title
 * @param {string} section.description
 * @param {number|null} [section.color]
 * @param {string|null} [section.footer]
 * @param {string|null} [section.target_channel_id]
 */
export async function upsertEmbedSection(db, section) {
  const {
    category,
    section_number,
    title,
    description,
    color = null,
    footer = null,
    target_channel_id = null,
  } = section;

  await db.query(
    `
    INSERT INTO embed_sections
      (category, section_number, title, description, color, footer, target_channel_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      description = VALUES(description),
      color = VALUES(color),
      footer = VALUES(footer),
      target_channel_id = VALUES(target_channel_id)
    `,
    [
      category,
      section_number,
      title,
      description,
      color,
      footer,
      target_channel_id,
    ]
  );
}

/**
 * Alias used by editembed.js:
 * Supports two call styles:
 *  1) updateEmbedSection(db, { category, section_number, ... })
 *  2) updateEmbedSection(db, category, sectionNumber, fieldsObject)
 *
 * @param {import("mysql2/promise").Pool} db
 * @param {object|string} sectionOrCategory
 * @param {number} [maybeSectionNumber]
 * @param {object} [maybeFields]
 */
export async function updateEmbedSection(db, sectionOrCategory, maybeSectionNumber, maybeFields) {
  // Style 1: updateEmbedSection(db, { category, section_number, ... })
  if (typeof sectionOrCategory === "object" && sectionOrCategory !== null) {
    return upsertEmbedSection(db, sectionOrCategory);
  }

  // Style 2: updateEmbedSection(db, category, sectionNumber, fieldsObject)
  const category = sectionOrCategory;
  const section_number = maybeSectionNumber;
  const fields = maybeFields || {};

  const section = {
    category,
    section_number,
    title: fields.title ?? "",
    description: fields.description ?? "",
    color: fields.color ?? null,
    footer: fields.footer ?? null,
    target_channel_id: fields.target_channel_id ?? null,
  };

  return upsertEmbedSection(db, section);
}

/**
 * Delete a single section (optional helper).
 *
 * @param {import("mysql2/promise").Pool} db
 * @param {string} category
 * @param {number} sectionNumber
 */
export async function deleteEmbedSection(db, category, sectionNumber) {
  await db.query(
    `DELETE FROM embed_sections WHERE category = ? AND section_number = ?`,
    [category, sectionNumber]
  );
}

/**
 * List all distinct categories (optional helper for management commands).
 *
 * @param {import("mysql2/promise").Pool} db
 */
export async function listEmbedCategories(db) {
  const [rows] = await db.query(
    `SELECT DISTINCT category FROM embed_sections ORDER BY category ASC`
  );
  return rows.map((r) => r.category);
}
