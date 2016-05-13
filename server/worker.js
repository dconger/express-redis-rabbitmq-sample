const amqp = require('amqplib');
const rp = require('request-promise');
const Promise = require('bluebird');
const redis = require('redis');

/* Promisify */

// Promise.promisifyAll(redis.RedisClient.prototype);


var channel, queue;

amqp
  .connect('amqp://localhost') // Here we connect to RabbitMQ
  .then(function(conn) {
    return conn.createChannel(); // We create a channel which is used for our app to interact with the broker
  })
  .then(function(ch) {
    channel = ch;
    return channel.assertExchange('scraping', 'fanout'); // We create an exchange called 'chat' of type 'fanout'
  })
  .then(function() {
    return channel.assertQueue('web_scraper'); // We create a queue called 'chat_history'
  })
  .then(function(q) {
    queue = q.queue;
    return channel.bindQueue(queue, 'scraping'); // We bind the 'chat' exchange to the 'chat_history' queue
  })
  .then(function() {
    return channel.consume(queue, function(msg) {
      var content = msg.content.toString(); 
      console.log('Saving message: ' + content); 
      
      rp('http://' + content)
        .then(function(htmlString) {
          // connect to redis
          let client = redis.createClient();

          client.on('connect', function() {
            client.set(content, htmlString, (err, reply) => {
              channel.ack(msg);
              client.quit();
            });
          });
        });
    });
  })
  .catch(function(err) {
    console.log(err);
  });

//   .then(function(q) {
//     queue = q.queue;
//     consume();
//   })
//   .catch(function(err) {
//     console.log(err.stack);
//   });

// function consume() {
//   channel.consume(queue, function(msg) {
//     console('msg: ', msg);
//     var url = msg.content.toString();
//     // scraping
//     rp(url)
//       .then(function(htmlString) {
//         // connect to redis
//         let client = redis.createClient({
//           retry_strategy: retryStrategy
//         });

//         client.on('connect', function() {
//           client.set(url, htmlString, (err, reply) => {
//             channel.ack(msg);
//             client.quit();
//           });
//         });
//       });
//   });
// };