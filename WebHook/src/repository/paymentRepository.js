const supabase = require('../clients/supabase-client.js');

class PaymentRepository {
    async savePayment(booking) {
        const{ user_id, total_price, id, payment_intent_id } = booking;
        const { data, error } = await supabase
            .from('payments')
            .insert([{
                user_id,
                total_price,
                status: 'sucedido',
                booking_id: id,
                payment_intent_id
            }]);

        if (error) {
            throw new Error(`Error saving payment: ${error.message}`);
        }

        return data;
    }

}

module.exports = new PaymentRepository();