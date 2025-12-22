/**
 * Normalize text for search: remove accents, handle curly quotes/apostrophes, and convert to lowercase.
 */
export const normalizeForSearch = (text: string | null | undefined): string => {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035']/g, "'") // Standardize all single quotes/apostrophes to straight '
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036"]/g, '"') // Standardize all double quotes to straight "
    .replace(/`/g, "'") // Backticks to single quote
    .trim();
};
