// Screen copy for a rejected note. The PDF still says "Awaiting cancellation".
export function rejectedConfirmationHeading(type) {
  return `You have rejected this ${type}.`
}

export function rejectedStatusMeaning(type) {
  return `The producer or compliance scheme rejected the ${type}.`
}

export const REJECTED_STATUS_LABEL = 'Rejected'

// Awaiting, accepted and rejected downloads all end "as a PDF".
export const DOWNLOAD_PDF_BUTTON_NAME = /^Download this .*as a pdf$/i
