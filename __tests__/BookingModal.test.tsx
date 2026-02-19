import { act, render, screen } from '@testing-library/react';
import BookingModal from '../app/components/BookingModal';

const flushPromises = () => new Promise<void>((resolve) => {
  setTimeout(resolve, 0);
});

async function renderOpenBookingModal(selectedRoom = 'Dorm Room') {
  await act(async () => {
    render(
      <BookingModal isOpen={true} onClose={() => {}} selectedRoom={selectedRoom} />
    );
    await flushPromises();
  });
}

describe('BookingModal', () => {
  it('renders modal when isOpen is true', async () => {
    await renderOpenBookingModal('Dorm Room');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not render modal when isOpen is false', () => {
    const { container } = render(
      <BookingModal isOpen={false} onClose={() => {}} selectedRoom="Dorm Room" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('displays the booking title', async () => {
    await renderOpenBookingModal('Standard Room');
    expect(screen.getByText(/Book Your Stay/i)).toBeInTheDocument();
  });
});
