const interface = {
    "demo.redhat.com": "/status/interfaces/rhpds.json",
    "partner.demo.redhat.com": "/status/interfaces/rhdp-partners.json",
    "test.dev.demo.redhat.com": "/status/interfaces/rhpds.json",
    "catalog.demo.redhat.com": "/status/interfaces/rhpds.json",
    "catalog.partner.demo.redhat.com": "/status/interfaces/rhdp-partners.json",
    "default": "/status/interfaces/rhdp-partners.json"
};

(function() {
    function getHtml(){
        return document.documentElement.innerHTML;
    }

    function get(obj, desc) {
        return obj[desc];
    }

    function replaceTokens(HTML, json) {
        return HTML.split('{{').map(function(i) { 
            var symbol = i.substring(0, i.indexOf('}}')).trim(); 
            return i.replace(symbol + '}}', get(json, symbol)); 
        }).join('');
    }

    fetch(interface[window.location.host] ?? interface.default)
        .then((response) => response.json())
        .then((json) => {
            document.documentElement.innerHTML = replaceTokens(getHtml(), json)
        });
     
})();
