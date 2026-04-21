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

int add(int a, int b) {
    return (a + b);
}

std::string greet(std::string who) {
    return __jspp_concat(__jspp_concat(std::string("Hello, "), who), std::string("!"));
}

int factorial(int n) {
    if ((n <= 1)) {
        return 1;
    }
    return (n * factorial((n - 1)));
}

class Animal {
public:
    std::string name;
    std::string sound;

    Animal(std::string name, std::string sound) {
        this->name = name;
        this->sound = sound;
    }

    std::string speak() {
        return __jspp_concat(__jspp_concat(this->name, std::string(" says ")), this->sound);
    }

};

class Dog : public Animal {
public:
    Dog(std::string name) : Animal(name, std::string("Woof!")) {
    }

};

enum class Color {
    Red = 0,
    Green = 1,
    Blue = 2,
};

std::string colorName(int c) {
    switch (c) {
        case 0:
            return std::string("Red");
        case 1:
            return std::string("Green");
        case 2:
            return std::string("Blue");
        default:
            return std::string("Unknown");
    }
}

int main() {
    std::string name = std::string("JSPP");
    int version = 1;
    double pi = 3.14159;
    std::vector<int> scores = std::vector<int>{95, 87, 72, 64, 100};
    int total = 0;
    for (int i = 0; (i < scores.size()); (i++)) {
        total = (total + scores[i]);
    }
    auto dbl = [=](int x) -> int { return (x * 2); };
    std::vector<std::string> fruits = std::vector<std::string>{std::string("apple"), std::string("banana"), std::string("cherry")};
    print(std::string("=== JSPP Demo ==="));
    print(std::string("Language:"), name, __jspp_concat(std::string("v"), version));
    print(std::string("Pi:"), pi);
    print(std::string("add(10, 20):"), add(10, 20));
    print(std::string("greet:"), greet(std::string("World")));
    print(std::string("factorial(6):"), factorial(6));
    print(std::string("scores total:"), total);
    print(std::string("average:"), (total / 5));
    auto rex = Dog(std::string("Rex"));
    print(std::string("dog:"), rex.speak());
    print(std::string("color 1:"), colorName(1));
    print(std::string("dbl(21):"), dbl(21));
    for (auto& f : fruits) {
        print(std::string("fruit:"), f);
    }
    print(std::string("=== Done ==="));
    return 0;
}
