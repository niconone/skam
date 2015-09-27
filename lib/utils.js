
exports.cleanNumber = function(phone) {
  if (phone.match(/^[0-9]{10}$/)) {
    phone = '+1' + phone;
  } else if (phone.indexOf('+') !== 0) {
    phone = '+' + phone;
  }

  return phone;
};