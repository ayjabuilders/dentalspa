import { ClinicWorkspace } from '../../components/workspace';
import { parseBookingRequestPreview } from '../../components/intake/booking-request-preview';

export default async function BookingReviewPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const preview = parseBookingRequestPreview(await searchParams);
  return <ClinicWorkspace page="booking-review" bookingPreview={preview}/>;
}
