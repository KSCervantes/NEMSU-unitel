import { render, screen } from '@testing-library/react';
import BookingModal from '../app/components/BookingModal';

describe('BookingModal', () => {
  it('renders modal when isOpen is true', () => {
    render(
      <BookingModal isOpen={true} onClose={() => {}} selectedRoom="Dorm Room" />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not render modal when isOpen is false', () => {
    const { container } = render(
      <BookingModal isOpen={false} onClose={() => {}} selectedRoom="Dorm Room" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('displays the booking title', () => {
    render(
      <BookingModal isOpen={true} onClose={() => {}} selectedRoom="Standard Room" />
    );
    expect(screen.getByText(/Book Your Stay/i)).toBeInTheDocument();
  });
});
