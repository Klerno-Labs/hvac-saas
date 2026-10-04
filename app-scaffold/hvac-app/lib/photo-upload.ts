// The multipart request goes through a Vercel Function, which stores it in R2.
// Leave room for form fields and boundaries beneath its 4.5 MB body limit.
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024
export const PHOTO_SIZE_LIMIT = '4 MB'
export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp']
