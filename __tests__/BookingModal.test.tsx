import { render, screen } from '@testing-library/react';
import BookingModal from '../app/components/BookingModal';

describe('BookingModal', () => {
  it('renders modal title', () => {
    render(<BookingModal open={true} onClose={() => {}} />);
    expect(screen.getByText(/Book a Room/i)).toBeInTheDocument();
  });
});
