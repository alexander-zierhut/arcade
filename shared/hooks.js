/* shared/hooks.js: the campaigns shown across every game: a card on a quiet screen (title, pause, the end of a
   level) every `every` minutes at most, once the player has played `after` minutes in total on this device. Edit
   this list, deploy, done: every game picks it up. Each entry:
     id        unique, never reused (the shown / clicked times are stored under it)
     every     minutes between two showings of this campaign (default 60), counted across all games
     after     minutes of play on this device before it shows the first time (default 0)
     screens   where it may show: ['title', 'pause', 'win', 'lose', 'end'] (default all of them)
     from / until   ISO dates, optional
     max       times it shows at most, optional
     title, text, button, dismiss   a string or { de: ..., en: ... }; text may hold simple HTML
     url       opened in a new tab by the button; after a click the campaign is not shown again (onceClicked: false to keep showing it)
   An empty list means no campaigns. */
window.Arcade.campaigns.define([
]);
