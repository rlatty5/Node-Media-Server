const md5 = require('crypto').createHash('md5');
let key = '<yoursecret>';
// timestamp of the expiration time in future
let exp = (Date.now() / 1000 | 0) + 9999999;
let streamId = '/live/tuter';
console.log(exp+'-'+md5.update(streamId+'-'+exp+'-'+key).digest('hex'));
