
/**
 * Validates if a given string is a valid hex color code.
 * @param colorCode - The color code to validate.
 * @returns True if the color code is valid, false otherwise.
 */

const validateColor = (colorCode: string): boolean => {
  return /^#([\dabcdefABCDEF]{3}){1,2}$/.test(colorCode);
};

export default validateColor;
