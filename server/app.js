const express = require('express');
const bodyParser = require('body-parser');
const redis = require('redis');
const amqp = require('amqplib');

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(__dirname + '/public'));

let retryStrategy = function (options) {
  if (options.error.code === 'ECONNREFUSED') {
    // End reconnecting on a specific error and flush all commands with a individual error
    return new Error('The server refused the connection');
  }
  if (options.total_retry_time > 1000 * 60 * 60) {
    // End reconnecting after a specific timeout and flush all commands with a individual error
    return new Error('Retry time exhausted');
  }
  if (options.times_connected > 10) {
    // End reconnecting with built in error
    return undefined;
  }
  // reconnect after
  return Math.max(options.attempt * 100, 3000);
};

var channel, queue;

app.route('/')
	.all((req, res, next) => {

		var url = req.query.url || req.body.url;

		if (url) {
			let client = redis.createClient({
				retry_strategy: retryStrategy
			});

			client.on('connect', function() {
				client.get(url, (err, reply) => {
					console.log(`redis get ${reply}`);

					if (!reply) {
						// add to rabbitMQ
						amqp.connect('amqp://localhost')
							.then(function(conn) {
								return conn.createChannel()
							})
							.then(function(ch) {
							    channel = ch;
							    return channel.assertExchange('scraping', 'fanout');
							  })
							  .then(function() {
							    return channel.assertQueue('web_scraper');
							  })
							  .then(function(q) {
							    queue = q.queue;
							    return channel.bindQueue(queue, 'scraping');
							  })
							  .then(function(q) {
								channel.publish('scraping', '', new Buffer(url));
								console.log("Sent " + url);
							  })

						res.send('loading');
					} else {
						res.send(`${reply}`);
					}

					client.quit();
				})
			})
		}
	});

app.listen(3000, () => {
	console.log('Example app on 3000');
});