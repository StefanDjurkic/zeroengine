#include <iostream>
#include <string>
#include <vector>

template<typename... Args>
void print(Args&&... args) {
    bool __first = true;
    ((std::cout << (__first ? "" : " ") << args, __first = false), ...);
    std::cout << std::endl;
}

template<typename T>
void __jspp_set(std::vector<T>& v, size_t i, T val) {
    if (i >= v.size()) v.resize(i + 1);
    v[i] = std::move(val);
}

template<typename T>
std::string __jspp_to_str(const T& v) { return std::to_string(v); }
inline std::string __jspp_to_str(const std::string& v) { return v; }
inline std::string __jspp_to_str(const char* v) { return std::string(v); }
template<typename A, typename B>
std::string __jspp_concat(const A& a, const B& b) { return __jspp_to_str(a) + __jspp_to_str(b); }

class Entity {
public:
    std::string name;
    double x = 0;
    double y = 0;
    int health;

    Entity(std::string name, int health) {
        this->name = name;
        this->health = health;
    }

    void takeDamage(int amount) {
        this->health -= amount;
        if ((this->health < 0)) {
            this->health = 0;
        }
    }

    bool isAlive() {
        return (this->health > 0);
    }

    void moveTo(double newX, double newY) {
        this->x = newX;
        this->y = newY;
    }

};

class Player : public Entity {
public:
    int score = 0;
    int level = 1;

    Player(std::string name) : Entity(name, 100) {
    }

    void addScore(int points) {
        this->score += points;
        if ((this->score >= (this->level * 1000))) {
            this->level += 1;
            (std::cout << this->name << " " << std::string("leveled up to") << " " << this->level << std::endl);
        }
    }

};

class Enemy : public Entity {
public:
    int damage;

    Enemy(std::string name, int health, int damage) : Entity(name, health) {
        this->damage = damage;
    }

    void attack(Entity target) {
        (std::cout << this->name << " " << std::string("attacks") << " " << target.name << " " << std::string("for") << " " << this->damage << " " << std::string("damage!") << std::endl);
        target.takeDamage(this->damage);
    }

};

int main() {
    auto player = Player(std::string("Hero"));
    auto goblin = Enemy(std::string("Goblin"), 30, 5);
    (std::cout << player.name << " " << std::string("HP:") << " " << player.health << std::endl);
    goblin.attack(player);
    (std::cout << player.name << " " << std::string("HP:") << " " << player.health << std::endl);
    player.addScore(500);
    (std::cout << std::string("Score:") << " " << player.score << std::endl);
    return 0;
}

