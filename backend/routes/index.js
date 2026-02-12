const { readdirSync } = require('fs');

module.exports = function(app) {
    readdirSync(__dirname).forEach(function(file) {
        if (file === "index.js" || file.substr(file.lastIndexOf('.') + 1) !== 'js')
            return;
        var name = file.substr(0, file.indexOf('.'));
        const route = require('./' + name);
        if (route && typeof route === 'function') {
            app.use('/' + name, route);
        }
    });
};
