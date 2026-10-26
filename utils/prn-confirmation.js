// Screen copy for a rejected note. The PDF still says "Awaiting cancellation".
export function rejectedConfirmationHeading(type) {
  return `You have rejected this ${type}.`
}

export function rejectedStatusMeaning(type) {
  return `The producer or compliance scheme rejected the ${type}.`
}

export const REJECTED_STATUS_LABEL = 'Rejected'

// Awaiting and accepted downloads end "as a PDF". The rejection banner ends
// "as a PDF or HTML".
export const DOWNLOAD_PDF_BUTTON_NAME = /^Download this .*as a pdf( or html)?$/i
